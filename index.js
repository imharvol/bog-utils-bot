require('dotenv').config()
const path = require('path')
const fs = require('fs')
const { getContract, getCachedBogPrice, getEarnings, roundDecimals, bogToUsd, usdToBog, getBogBalance, getContractEvents } = require('./bogUtils')
const { Telegraf } = require('telegraf') // https://telegraf.js.org/
const Database = require('better-sqlite3') // https://github.com/JoshuaWise/better-sqlite3/blob/HEAD/docs/api.md
const ejs = require('ejs')

const db = new Database(path.join(__dirname, 'db.sqlite')/*, { verbose: console.log } */)
const bot = new Telegraf(process.env.TELEGRAM_TOKEN)

const telegramMessages = JSON.parse(fs.readFileSync('telegram-messages.json'))

const sniperContractAddress = '0x8dc28ba111cde2342c083936157f6a8e53fe5514'

/**
 * /start
 *
 * This command is always run when a user contacts a bot.
 * When the command is ran we check if the user is in the database,
 * if the user is not in the database we add as much information as we have at the moment.
 * Then we just send him a welcome message.
 */
bot.start((ctx) => {
  // Check if the user is in the db and if it's not, add it
  const userRegistered = Object.values(db.prepare('SELECT EXISTS (SELECT * FROM users WHERE id = ?)').get(ctx.from.id))[0]
  if (!userRegistered) db.prepare('INSERT INTO users (id, username) VALUES (?, ?)').run(ctx.from.id, ctx.from.username)

  const html = ejs.render(telegramMessages['/start'], {
    username: ctx.from.username
  })
  ctx.replyWithHTML(html)
})

/**
 * /help
 *
 * Sends a list of commands and a description about how to use each.
 */
bot.help((ctx) => {
  const html = telegramMessages['/help']
  ctx.replyWithHTML(html)
})

/**
 * /price
 *
 * Sends the current price of the BOG token.
 */
bot.command('price', async (ctx) => {
  const decimals = 4
  const bogPrice = await getCachedBogPrice(decimals)

  const html = ejs.render(telegramMessages['/price'], { bogPrice })
  ctx.replyWithHTML(html)
})

/**
 * /setAddress address
 *
 * Sets a default address to use by other commands if a address is not provided.
 * We first check that the user is already registered.
 */
bot.command('setAddress', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  if (messageArgs.length !== 1) return ctx.replyWithHTML(telegramMessages['/setAddress-no-address'])

  const address = messageArgs[0].toLowerCase()

  const userRegistered = Object.values(db.prepare('SELECT EXISTS (SELECT * FROM users WHERE id = ?)').get(ctx.from.id))[0]
  if (!userRegistered) return ctx.replyWithHTML(telegramMessages['not-registered'])
  db.prepare('UPDATE users SET address = ? WHERE id IS ?').run(address, ctx.from.id)

  const html = ejs.render(telegramMessages['/setAddress'], { address })
  ctx.replyWithHTML(html)
})

/**
 * /earnings [address]
 *
 * Returns the staked earnings.
 * If an address is provided, it will return the earnings of that address.
 * If no address is received but there is a default address, the earnings of the default addres will be returned.
 * If neither of those, we advice the user to provide a address or to set a default address.
 */
bot.command('earnings', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  let address
  if (messageArgs.length === 0) {
    address = db.prepare('SELECT address FROM users WHERE id = ?').get(ctx.from.id).address
  } else if (messageArgs.length === 1) {
    address = messageArgs[0]
  }
  if (!address) return ctx.replyWithHTML(telegramMessages['/earnings-no-address'])

  const earningsBOG = await getEarnings(address, 2)
  const earningsUSD = roundDecimals(earningsBOG * await getCachedBogPrice(), 2)

  const html = ejs.render(telegramMessages['/earnings'], { address, earningsBOG, earningsUSD })
  ctx.replyWithHTML(html)
})

/**
 * /resume
 *
 * Returns a resume of things that could interest the user.
 * Right now it only returns the BOG price and the staked earnings.
 */
bot.command('resume', async (ctx) => {
  const address = db.prepare('SELECT address FROM users WHERE id = ?').get(ctx.from.id)?.address
  if (!address) return ctx.replyWithHTML(telegramMessages['set-address'])

  let bogPrice = getCachedBogPrice(2)
  let stakedEarningsBog = getEarnings(address, 2)
  let bogBalance = getBogBalance(address)

  await Promise.all([bogPrice, stakedEarningsBog, bogBalance])

  bogPrice = await bogPrice // Apparently we have to use await to get the result of the promise despite being resolved
  stakedEarningsBog = await stakedEarningsBog
  const stakedEarningsUsd = roundDecimals(bogPrice * stakedEarningsBog, 2)
  bogBalance = await bogBalance
  const balanceBog = roundDecimals(bogBalance, 2)
  const balanceUsd = roundDecimals(await bogToUsd(bogBalance), 2)

  const html = ejs.render(telegramMessages['/resume'], { address, bogPrice, stakedEarningsBog, stakedEarningsUsd, balanceBog, balanceUsd })
  ctx.replyWithHTML(html)
})

/**
 * /bogToUsd bogNumber
 *
 * Converts a BOG ammount to USD
 */
bot.command('bogToUsd', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  if (messageArgs.length !== 1) return ctx.replyWithHTML(telegramMessages['/bogToUsd-no-amount'])
  const bogAmount = parseFloat(messageArgs[0])

  const usdAmount = roundDecimals(await bogToUsd(bogAmount), 2)

  const html = ejs.render(telegramMessages['/bogToUsd'], { bogAmount, usdAmount })
  ctx.replyWithHTML(html)
})

/**
 * /usdToBog usdNumber
 *
 * Converts a USD ammount to BOG
 */
bot.command('usdToBog', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  if (messageArgs.length !== 1) return ctx.replyWithHTML(telegramMessages['/usdToBog-no-amount'])
  const usdAmount = parseFloat(messageArgs[0])

  const bogAmount = roundDecimals(await usdToBog(usdAmount), 2)

  const html = ejs.render(telegramMessages['/usdToBog'], { usdAmount, bogAmount })
  ctx.replyWithHTML(html)
})

/**
 * /balance [account]
 *
 * Gets a account's balance. If no account is provided, the balance of the default address will be returned.
 */
bot.command('balance', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  let address
  if (messageArgs.length === 0) {
    address = db.prepare('SELECT address FROM users WHERE id = ?').get(ctx.from.id).address
  } else if (messageArgs.length === 1) {
    address = messageArgs[0]
  }
  if (!address) return ctx.replyWithHTML(telegramMessages['/balance-no-address'])

  let bogBalance = getBogBalance(address)
  let usdBalance = bogToUsd(bogBalance)

  await Promise.all(bogBalance, usdBalance)

  bogBalance = roundDecimals(await bogBalance, 2)
  usdBalance = roundDecimals(await usdBalance, 2)

  const html = ejs.render(telegramMessages['/balance'], { address, bogBalance, usdBalance })
  ctx.replyWithHTML(html)
})

/**
 * /subscribe eventName [account]
 *
 * Subscribes to an event related to an account. If no account is specified, it'll try to use the registered address.
 * It's possible to use "all" as the eventName to subscribe to every event related to some address.
 * It's possible to use "all" as the account argument to subscribe to every instance of that event no matter what address it's related to.
 * It's possible to use "all" as the eventName and account arguments to subscribe to all events on all addresses.
 */
bot.command('subscribe', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  const eventName = messageArgs[0]
  let address
  if (messageArgs.length === 1) {
    address = db.prepare('SELECT address FROM users WHERE id = ?').get(ctx.from.id).address
  } else if (messageArgs.length === 2) {
    address = messageArgs[1].toLowerCase()
  }
  if (!address || !eventName) {
    const possibleEvents = await getContractEvents(sniperContractAddress)
    const html = ejs.render(telegramMessages['/subscribe-no-args'], { possibleEvents })
    return ctx.replyWithHTML(html)
  }

  // TODO: A CHECK on the DB would be better
  // Make sure that it's not inserting a duplicate
  const alreadySubscribed = Object.values(db.prepare("SELECT EXISTS (SELECT * FROM subscriptions WHERE userId = ? AND (eventName = ? OR eventName = 'all') AND (address = ? OR address = 'all'))").get(ctx.from.id, eventName, address))[0]
  if (alreadySubscribed) return ctx.replyWithHTML(telegramMessages['/subscribe-already-subscribed'])

  // Delete duplicates from database
  if (eventName === 'all') db.prepare('DELETE FROM subscriptions WHERE userId = ? AND address = ?').run(ctx.from.id, address)
  if (address === 'all') db.prepare('DELETE FROM subscriptions WHERE userId = ? AND eventName = ?').run(ctx.from.id, eventName)

  // Insert the subscription to the database
  db.prepare('INSERT INTO subscriptions (userId, eventName, address) VALUES (?, ?, ?)').run(ctx.from.id, eventName, address)

  const html = ejs.render(telegramMessages['/subscribe'], { eventName, address })
  ctx.replyWithHTML(html)
})

/**
 * /subscriptions
 *
 * Returns a list with the current subscriptions
 */
bot.command('subscriptions', async (ctx) => {
  const subscriptions = db.prepare('SELECT * FROM subscriptions WHERE userId = ?').all(ctx.from.id)

  if (subscriptions.length === 0) {
    return ctx.replyWithHTML(telegramMessages['/subscriptions-no-subscriptions'])
  }

  const possibleEvents = await getContractEvents(sniperContractAddress)

  const html = ejs.render(telegramMessages['/subscriptions'], { subscriptions, possibleEvents })
  ctx.replyWithHTML(html)
})

/**
 * /unsubscribe eventName [account]
 *
 * Unsubscribes from an event related to an account. If no account is specified, it'll try to use the registered address.
 * It's possible to use "all" as the eventName to unsubscribe from every event related to some address.
 * It's possible to use "all" as the account argument to unsubscribe from every instance of that event no matter what address it's related to.
 * It's possible to use "all" as the eventName and account arguments to unsubscribe from all events on all addresses.
 */
bot.command('unsubscribe', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  const eventName = messageArgs[0]
  let address
  if (messageArgs.length === 1) {
    address = db.prepare('SELECT address FROM users WHERE id = ?').get(ctx.from.id).address
  } else if (messageArgs.length === 2) {
    address = messageArgs[1].toLowerCase()
  }
  if (!address || !eventName) {
    return ctx.replyWithHTML(telegramMessages['/unsubscribe-no-args'])
  }
  if (eventName === 'all' || address === 'all') {
    db.prepare('DELETE FROM subscriptions WHERE userId = ?').run(ctx.from.id)
  } else if (eventName === 'all') {
    db.prepare('DELETE FROM subscriptions WHERE userId = ? AND address = ?').run(ctx.from.id, address)
  } else if (address === 'all') {
    db.prepare('DELETE FROM subscriptions WHERE userId = ? AND eventName = ?').run(ctx.from.id, eventName)
  } else {
    const subscribed = Object.values(db.prepare('SELECT EXISTS (SELECT * FROM subscriptions WHERE userId = ? AND eventName = ? AND address = ?)').get(ctx.from.id, eventName, address))[0]
    if (!subscribed) return ctx.replyWithHTML(telegramMessages['/unsubscribe-not-subscribed'])
    db.prepare('DELETE FROM subscriptions WHERE userId = ? AND eventName = ? AND address = ?').run(ctx.from.id, eventName, address)
  }

  const html = ejs.render(telegramMessages['/unsubscribe'], { eventName, address })
  ctx.replyWithHTML(html)
})

bot.command('source', async (ctx) => {
  const html = telegramMessages['/source']
  ctx.replyWithHTML(html)
})

async function main () {
  bot.launch()

  // Set up listener for sniper events
  const sniperContract = await getContract(sniperContractAddress)
  /* sniperContract.events.OrderFulfilled((err, result) => console.log(result)) */
  sniperContract.events.allEvents(async (err, result) => {
    if (err) throw err

    const orderID = result.returnValues.orderID
    const eventName = result.event
    const address = (await sniperContract.methods.orders(orderID).call()).owner

    const subscribers = db.prepare(
      "SELECT DISTINCT userId FROM subscriptions WHERE (eventName = ? AND address = ?) OR (eventName = ? AND address = 'all') OR (eventName = 'all' AND address = ?) OR (eventName = 'all' AND address = 'all')"
    ).all(eventName, address, eventName, address)

    const html = ejs.render(telegramMessages['snipe-event-triggered'], { eventName, orderID, address })

    for (const subscriber of subscribers) {
      bot.telegram.sendMessage(subscriber.userId, html)
    }
  })
}
main()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

// TODO: Add commas when numbers are big
