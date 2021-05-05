# Bog Utils Bot
Bog Utils Bot is a ultils Telegram bot for [BOG](https://bogged.finance/) and [BogTools](https://bogtools.io/).
Current functionality:
- Get BOG token price
- Get staked earnings

### Try the bot!
You can try the bot right now: http://t.me/BOGUtilsBot

### How to run
1. Create a .env file with your telegram bot's and BscScan auth tokens:
```
TELEGRAM_TOKEN=YOUR_TELEGRAM_TOKEN
BSCSCAN_TOKEN=YOUR_BSCSCAN_TOKEN
```
2. Install the dependencies with `npm install`.
3. Generate de SQLite Database with `npm run createDatabase`. The database will be saved in ./db.sqlite.
4. Run the bot with `npm start`.