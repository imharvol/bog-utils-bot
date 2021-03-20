# Bog Utils Bot
Bog Utils Bot is a ultils Telegram bot for [BOG](https://bogged.finance/) and [BogTools](https://bogtools.io/).
Current functionality:
- Get BOG token price
- Get staked earnings

### Try the bot!
You can try the bot right now: http://t.me/BOGUtilsBot

### How to run
1. Create a .env file with your bot's token:
```
BOT_TOKEN=YOUR-TOKEN
```
2. Generate de SQLite Database with `npm run createDatabase`. The database will be saved in ./db.sqlite.
3. Run the bot with `npm start`.