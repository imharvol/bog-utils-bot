const fs = require('fs')
const { Markup } = require('telegraf')
const ejs = require('ejs')
const web3 = require('web3')
const { getCachedBogPrice, getEarnings, getBogBalance, roundDecimals, bogToUsd } = require('./bogUtils')

const telegramMessages = JSON.parse(fs.readFileSync('telegram-messages.json'))

// ===== myAddress submenu ===== //
function myAddress (db, bot, ctx) {
  const address = ctx.bog.address
  const message = ejs.render(telegramMessages.myAddress, { address })

  let menu
  if (address) {
    menu = Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Copy Address ✏️', 'copyAddress')],
      [Markup.button.callback('❌ Remove Address ❌', 'removeAddress')]
      // [Markup.button.callback('⬅️ Return ⬅️', 'return')]
    ]).resize()
  } else {
    menu = Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Set Address ✏️', 'setAddress')]
      // [Markup.button.callback('⬅️ Return ⬅️', 'return')]
    ]).resize()
  }

  bot.telegram.editMessageText(
    ctx.callbackQuery.message.chat.id,
    ctx.callbackQuery.message.message_id,
    ctx.callbackQuery.message.message_id,
    message,
    {
      parse_mode: 'HTML',
      ...menu
    }
  )
}

async function setAddress (db, bot, ctx) {
  const address = ctx.bog.address
  const message = ejs.render(telegramMessages.setAddress, { address })

  const messageSent = await bot.telegram.sendMessage(
    ctx.callbackQuery.message.chat.id,
    message,
    {
      parse_mode: 'HTML',
      ...Markup.forceReply()
    }
  )
  const messageReplyId = messageSent.message_id

  bot.expect({
    replyTo: messageReplyId,
    messageCheck: ctx => web3.utils.isAddress(ctx.message.text),
    messageCheckFail: ctx => {
      ctx.replyWithHTML("Either that's not an address or the checksum isn't correct")
    },
    messageCheckSuccess: ctx => {
      const address = ctx.message.text
      db.prepare('UPDATE users SET address = ? WHERE id IS ?').run(address, ctx.from.id)
      ctx.replyWithHTML('This is your new address: ' + address)
    }
  })
}

function removeAddress (db, bot, ctx) {
  const message = telegramMessages.removeAddress

  const menu = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Set Address ✏️', 'setAddress')]
    // [Markup.button.callback('⬅️ Return ⬅️', 'return')]
  ]).resize()

  db.prepare('UPDATE users SET address = NULL WHERE id IS ?').run(ctx.from.id)

  bot.telegram.editMessageText(
    ctx.callbackQuery.message.chat.id,
    ctx.callbackQuery.message.message_id,
    ctx.callbackQuery.message.message_id,
    message,
    {
      parse_mode: 'HTML',
      ...menu
    }
  )
}

function copyAddress (db, bot, ctx) {
  const address = ctx.bog.address
  const message = ejs.render(telegramMessages.copyAddress, { address })

  const menu = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Copy Address ✏️', 'copyAddress')],
    [Markup.button.callback('❌ Remove Address ❌', 'removeAddress')],
    [Markup.button.callback('⬅️ Return ⬅️', 'return')]
  ]).resize()

  bot.telegram.editMessageText(
    ctx.callbackQuery.message.chat.id,
    ctx.callbackQuery.message.message_id,
    ctx.callbackQuery.message.message_id,
    message,
    {
      parse_mode: 'HTML',
      ...menu
    }
  )

  bot.telegram.answerCbQuery(ctx.update.callback_query.id)
}

// ===== price submenu ===== //
async function price (db, bot, ctx) {
  const decimals = 4
  const bogPrice = await getCachedBogPrice(decimals)

  const message = ejs.render(telegramMessages.price, { bogPrice })

  bot.telegram.sendMessage(
    ctx.callbackQuery.message.chat.id,
    message,
    {
      parse_mode: 'HTML'
    }
  )

  bot.telegram.answerCbQuery(ctx.update.callback_query.id)
}

// ===== resume submenu ===== //
async function resume (db, bot, ctx) {
  const decimals = 4
  const address = ctx.bog.address

  if (!address) {
    return bot.telegram.sendMessage(
      ctx.callbackQuery.message.chat.id,
      telegramMessages['resume-no-address'],
      { parse_mode: 'HTML' }
    )
  }

  let bogPrice = getCachedBogPrice(decimals)
  let stakedEarningsBog = getEarnings(address, decimals)
  let bogBalance = getBogBalance(address)

  // Waiting for all promises concurrently saves some time
  await Promise.all([bogPrice, stakedEarningsBog, bogBalance])

  bogPrice = await bogPrice
  stakedEarningsBog = await stakedEarningsBog
  const stakedEarningsUsd = roundDecimals(bogPrice * stakedEarningsBog, decimals)
  bogBalance = await bogBalance
  const balanceBog = roundDecimals(bogBalance, decimals)
  const balanceUsd = roundDecimals(await bogToUsd(bogBalance), decimals)

  const message = ejs.render(telegramMessages.resume, { address, bogPrice, stakedEarningsBog, stakedEarningsUsd, balanceBog, balanceUsd })

  bot.telegram.sendMessage(
    ctx.callbackQuery.message.chat.id,
    message,
    {
      parse_mode: 'HTML'
    }
  )

  bot.telegram.answerCbQuery(ctx.update.callback_query.id)
}

// ===== balance submenu ===== //
async function balance (db, bot, ctx) {
  const decimals = 4
  const address = ctx.bog.address

  if (!address) {
    return bot.telegram.sendMessage(
      ctx.callbackQuery.message.chat.id,
      telegramMessages['balance-no-address'],
      { parse_mode: 'HTML' }
    )
  }

  const bogBalance = roundDecimals(await getBogBalance(address), decimals)
  const usdBalance = roundDecimals(await bogToUsd(bogBalance), decimals)

  const message = ejs.render(telegramMessages.balance, { address, bogBalance, usdBalance })

  bot.telegram.sendMessage(
    ctx.callbackQuery.message.chat.id,
    message,
    {
      parse_mode: 'HTML'
    }
  )

  bot.telegram.answerCbQuery(ctx.update.callback_query.id)
}

// ===== stakingEarnings submenu ===== //
async function stakingEarnings (db, bot, ctx) {
  const decimals = 4
  const address = ctx.bog.address

  if (!address) {
    return bot.telegram.sendMessage(
      ctx.callbackQuery.message.chat.id,
      telegramMessages['stakingEarnings-no-address'],
      { parse_mode: 'HTML' }
    )
  }

  const earningsBOG = await getEarnings(address, decimals)
  const earningsUSD = roundDecimals(earningsBOG * await getCachedBogPrice(), decimals)

  const message = ejs.render(telegramMessages.stakingEarnings, { address, earningsBOG, earningsUSD })

  bot.telegram.sendMessage(
    ctx.callbackQuery.message.chat.id,
    message,
    {
      parse_mode: 'HTML'
    }
  )

  bot.telegram.answerCbQuery(ctx.update.callback_query.id)
}

module.exports = { myAddress, setAddress, removeAddress, copyAddress, price, resume, balance, stakingEarnings }
