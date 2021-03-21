require('dotenv').config()
const path = require('path')
const { getCachedBogPrice, getEarnings, roundDecimals } = require('./bogUtils')
const { Telegraf } = require('telegraf') // https://telegraf.js.org/
const Database = require('better-sqlite3') // https://github.com/JoshuaWise/better-sqlite3/blob/HEAD/docs/api.md

const db = new Database(path.join(__dirname, 'db.sqlite')/*, { verbose: console.log } */)
const bot = new Telegraf(process.env.BOT_TOKEN)

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

I'm a utility bot for <a href="http://bogtools.io/">BogTools</a> and the <a href="https://bogged.finance/">BOG token</a>. You can see what I can do for you with /help.
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
- <b>/setAddress</b> - Sets the default address for the other commands
- <b>/earnings</b> - Returns the ammount of staked earnings
- <b>/resume</b> -  Returns a resume of the accound and of the BOG token
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
  const address = messageArgs[0]

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
  const address = db.prepare('SELECT address FROM users WHERE id = ?').get(ctx.from.id).address
  if (!address) return ctx.replyWithHTML('Please, set your address with /setAddress.')

  const bogPrice = await getCachedBogPrice(2)
  const stakedEarningsBog = await getEarnings(address, 2)
  const stakedEarningsUsd = roundDecimals(bogPrice * stakedEarningsBog, 2)

  const html = `
Resume for <b>${address}</b>:
- Current BOG price: <b>$${bogPrice}</b>
- Staked earnings: <b>${stakedEarningsBog}</b> BOG = <b>$${stakedEarningsUsd}</b> 
  `
  ctx.replyWithHTML(html)
})

bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
