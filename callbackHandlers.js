const fs = require('fs')
const { Markup } = require('telegraf')
const ejs = require('ejs')
const web3 = require('web3')

const telegramMessages = JSON.parse(fs.readFileSync('telegram-messages.json'))

function myAddress (db, bot, ctx) {
  const address = ctx.bog.address
  const message = ejs.render(telegramMessages.myAddress, { address })

  let menu
  if (address) {
    menu = Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Copy Address ✏️', 'copyAddress')],
      [Markup.button.callback('❌ Remove Address ❌', 'removeAddress')],
      [Markup.button.callback('⬅️ Return ⬅️', 'return')]
    ]).resize()
  } else {
    menu = Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Set Address ✏️', 'setAddress')],
      [Markup.button.callback('⬅️ Return ⬅️', 'return')]
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
  const address = ctx.bog.address
  const message = telegramMessages.removeAddress

  let menu = Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Set Address ✏️', 'setAddress')],
    [Markup.button.callback('⬅️ Return ⬅️', 'return')]
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

  let menu = Markup.inlineKeyboard([
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

module.exports = { myAddress, setAddress, removeAddress, copyAddress }
