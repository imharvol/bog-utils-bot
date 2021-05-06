require('dotenv').config()
const path = require('path')
const { getContract, getCachedBogPrice, getEarnings, roundDecimals, bogToUsd, usdToBog, getBogBalance, getContractEvents } = require('./bogUtils')
const { Telegraf } = require('telegraf') // https://telegraf.js.org/
const Database = require('better-sqlite3') // https://github.com/JoshuaWise/better-sqlite3/blob/HEAD/docs/api.md

const db = new Database(path.join(__dirname, 'db.sqlite')/*, { verbose: console.log } */)
const bot = new Telegraf(process.env.TELEGRAM_TOKEN)

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

  const html = `
Welcome, <b>${ctx.from.username}</b>!

I'm a unofficial and <a href="https://github.com/imharvol/bog-utils-bot">open source</a> utility bot for <a href="http://bogtools.io/">BogTools</a> and the <a href="https://bogged.finance/">BOG token</a>. You can see what I can do for you with /help.
  `
  ctx.replyWithHTML(html)
})

/**
 * /help
 *
 * Sends a list of commands and a description about how to use each.
 */
bot.help((ctx) => {
  const html = `
- <b>/price</b> - Returns the price of BOG
- <b>/setAddress address</b> - Sets the default address for the other commands
- <b>/earnings [address]</b> - Returns the ammount of staked earnings
- <b>/resume</b> -  Returns a resume of the accound and of the BOG token
- <b>/bogToUsd ammount</b> -  Converts ammount of BOG to USD
- <b>/usdToBog ammount</b> -  Converts ammount of USD to BOG
- <b>/subscribe eventName [address]</b> - Subscribe to a sniper event
- <b>/unsubscribe eventName [address]</b> - Subscribe from a sniper event
- <b>/subscriptions</b> - Check your current subscriptions and possible events 
- <b>/source</b> - My source code!
  `
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
  const html = `
The current rates are:
1 BOG = <b>$${bogPrice}</b>
  `
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
  if (messageArgs.length !== 1) return ctx.replyWithHTML('To set your default address you need to specify a address. For example:\n<code>/setAddress 0xd7b729ef857aa773f47d37088a1181bb3fbf0099</code>')
  const address = messageArgs[0].toLowerCase()

  const userRegistered = Object.values(db.prepare('SELECT EXISTS (SELECT * FROM users WHERE id = ?)').get(ctx.from.id))[0]
  if (!userRegistered) return ctx.replyWithHTML('Your user is not registered, please run /start to register')
  db.prepare('UPDATE users SET address = ? WHERE id IS ?').run(address, ctx.from.id)

  const html = `
<b>${messageArgs[0]}</b> is now your default address.
  `
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
  if (!address) return ctx.replyWithHTML('Please provide a address like this:\n<code>/earnings 0xd7b729ef857aa773f47d37088a1181bb3fbf0099</code>\n\nYou can also set a default addres with /setAddress and then simply call /earnings.')

  const earningsBOG = await getEarnings(address, 2)
  const earningsUSD = roundDecimals(earningsBOG * await getCachedBogPrice(), 2)

  const html = `
Earnings for <b>${address}</b>:
<b>${earningsBOG}</b> BOG = <b>$${earningsUSD}</b>
  `
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
  if (!address) return ctx.replyWithHTML('Please, set your address with /setAddress.')

  // TODO: This could be executed concurrently
  const bogPrice = await getCachedBogPrice(2)
  const stakedEarningsBog = await getEarnings(address, 2)
  const stakedEarningsUsd = roundDecimals(bogPrice * stakedEarningsBog, 2)
  const bogBalance = await getBogBalance(address)

  const html = `
Resume for <b>${address}</b>:
- Current BOG price: <b>$${bogPrice}</b>
- Staked earnings: <b>${stakedEarningsBog}</b> BOG = <b>$${stakedEarningsUsd}</b>
- Current balance: <b>${roundDecimals(bogBalance, 2)}</b> BOG = <b>$${roundDecimals(await bogToUsd(bogBalance), 2)}</b>
  `
  ctx.replyWithHTML(html)
})

/**
 * /bogToUsd bogNumber
 *
 * Converts a BOG ammount to USD
 */
bot.command('bogToUsd', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  if (messageArgs.length !== 1) return ctx.replyWithHTML('You need to provide the ammount of BOG that you want to convert to USD. For example:\n<code>/bogToUsd 5</code>')
  const bog = parseFloat(messageArgs[0])

  const html = `
${bog} BOG = <b>$${roundDecimals(await bogToUsd(bog), 2)}</b>
  `
  ctx.replyWithHTML(html)
})

/**
 * /usdToBog usdNumber
 *
 * Converts a USD ammount to BOG
 */
bot.command('usdToBog', async (ctx) => {
  const messageArgs = ctx.message.text.split(' ').slice(1)
  if (messageArgs.length !== 1) return ctx.replyWithHTML('You need to provide the ammount of USD that you want to convert to BOG. For example:\n<code>/usdToBog 5</code>')
  const usd = parseFloat(messageArgs[0])

  const html = `
$${usd} = <b>${roundDecimals(await usdToBog(usd), 2)} BOG</b>
  `
  ctx.replyWithHTML(html)
})

/**
 * /balance account
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
  if (!address) return ctx.replyWithHTML('Please provide a address like this:\n<code>/balance 0xd7b729ef857aa773f47d37088a1181bb3fbf0099</code>\n\nYou can also set a default addres with /setAddress and then simply call /balance.')

  const bogBalance = await getBogBalance(address)

  const html = `
Balance for <b>${address}</b>:
<b>${roundDecimals(bogBalance, 2)}</b> BOG = <b>$${roundDecimals(await bogToUsd(bogBalance), 2)}</b>
  `
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
    return ctx.replyWithHTML(`
Please provide a event name and address like this:
<code>/subscribe eventName 0xd7b729ef857aa773f47d37088a1181bb3fbf0099</code>

You can also set a default addres with /setAddress and then simply call
<code>/subscribe eventName</code>

Possible events: ${(await getContractEvents(sniperContractAddress)).join(', ')}
You can also use "all" as event name and/or address.
  `)
  }

  // TODO: A CHECK on the DB would be better
  // Make sure that it's not inserting a duplicate
  const alreadySubscribed = Object.values(db.prepare("SELECT EXISTS (SELECT * FROM subscriptions WHERE userId = ? AND (eventName = ? OR eventName = 'all') AND (address = ? OR address = 'all'))").get(ctx.from.id, eventName, address))[0]
  if (alreadySubscribed) return ctx.replyWithHTML('You are already subscribed to that event/address!')

  // Delete duplicates from database
  if (eventName === 'all') db.prepare('DELETE FROM subscriptions WHERE userId = ? AND address = ?').run(ctx.from.id, address)
  if (address === 'all') db.prepare('DELETE FROM subscriptions WHERE userId = ? AND eventName = ?').run(ctx.from.id, eventName)

  db.prepare('INSERT INTO subscriptions (userId, eventName, address) VALUES (?, ?, ?)').run(ctx.from.id, eventName, address)

  const html = `
You have been succesfully subscribed to <b>${eventName}</b> events on <b>${address}</b>${address === 'all' ? ' addresses' : '!'}
  `
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
    return ctx.replyWithHTML(`
You have no subscriptions!
Try subscribing to a event using /subscribe
  `)
  }

  let html = 'Your current subscriptions:\n'

  for (const subscription of subscriptions) {
    html += `- <b>${subscription.eventName}</b> events on <b>${subscription.address}</b> ${subscription.address === 'all' ? ' addresses' : ''}\n`
  }

  html += '\nPossible events: ' + (await getContractEvents(sniperContractAddress)).join(', ')
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
    return ctx.replyWithHTML(`
Please provide a event name and address like this:
<code>/unsubscribe eventName 0xd7b729ef857aa773f47d37088a1181bb3fbf0099</code>

You can also set a default addres with /setAddress and then simply call
<code>/unsubscribe eventName</code>

You can also use "all" as event name and/or address
  `)
  }
  if (eventName === 'all' || address === 'all') {
    db.prepare('DELETE FROM subscriptions WHERE userId = ?').run(ctx.from.id)
  } else if (eventName === 'all') {
    db.prepare('DELETE FROM subscriptions WHERE userId = ? AND address = ?').run(ctx.from.id, address)
  } else if (address === 'all') {
    db.prepare('DELETE FROM subscriptions WHERE userId = ? AND eventName = ?').run(ctx.from.id, eventName)
  } else {
    const subscribed = Object.values(db.prepare('SELECT EXISTS (SELECT * FROM subscriptions WHERE userId = ? AND eventName = ? AND address = ?)').get(ctx.from.id, eventName, address))[0]
    if (!subscribed) return ctx.replyWithHTML('You are not subscribed to that event/address')
    db.prepare('DELETE FROM subscriptions WHERE userId = ? AND eventName = ? AND address = ?').run(ctx.from.id, eventName, address)
  }

  const html = `
You have been succesfully unsubscribed from <b>${eventName}</b> events on <b>${address}</b>${address === 'all' ? ' addresses' : ''}
  `
  ctx.replyWithHTML(html)
})

bot.command('source', async (ctx) => {
  const html = 'You can find my source code on https://github.com/imharvol/bog-utils-bot!'
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

    const html = `Event ${eventName} has been triggered for order id ${orderID} and owner ${address}`

    for (const subscriber of subscribers) {
      bot.telegram.sendMessage(subscriber.userId, html)
    }
  })
}
main()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

// TODO: Add commas when numbers are big
