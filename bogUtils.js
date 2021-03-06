const path = require('path')
const fs = require('fs')
const Web3 = require('web3') // https://web3js.readthedocs.io/en/v1.3.4/index.html
const https = require('https') // https://nodejs.org/api/https.html

// https://bsc-dataseed.binance.org/
const web3 = new Web3(process.env.RPC_ENDPOINT || 'https://bsc-dataseed.binance.org/')

const CACHING_TIME = 1000 // How often is the cached price updated
const CACHING_THRESHOLD = 2500 // Determines for how much time a cached price is accepted

let cachedBogPrice = null // Variable that updates every ~500ms with the $BOG price with 4 decimals
let cachedBogPriceTimestamp = null // Timestamp of the cached BOG price
let cachingInterval // Boolean that determines if the price should be cached periodically
const cachedAbis = {} // Map of cached address-abi

// Sniper's contract
cachedAbis['0x8dc28ba111cde2342c083936157f6a8e53fe5514'] = JSON.parse(fs.readFileSync(path.join(__dirname, 'sniper-abi.json')))

/**
 * Rounds a number n to d decimals
 * @param {Number} n Number
 * @param {Number} d Decimals. If not defined, will return the full number
 * @returns Number n rounded to d decimals
 */
function roundDecimals (n, d) {
  if ((d ?? true) === true) return n
  return Math.round(n * (10 ** d)) / 10 ** d
}

/**
 * Fetches a URL's contents
 * @param {string} url URL to fetch
 * @param {Object} options Options for https.get()
 * @returns The URL's content
 */
function fetch (url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, options, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

/**
 * Returns the ABI interface of a contract
 * @param {String} address
 * @returns JSON ABI interface
 */
async function getAbi (address) {
  if (!cachedAbis[address]) {
    const request = JSON.parse(await fetch(`https://api.bscscan.com/api?module=contract&action=getabi&address=${address}&apikey=${process.env.BSCSCAN_TOKEN}`))
    if (request.message !== 'OK') throw new Error("Could not retrieve the contract's ABI")
    cachedAbis[address] = JSON.parse(request.result)
  }

  return cachedAbis[address]
}

/**
 * Returns a web3 contract object from an address. Fetches the ABI from BscScan and caches it if it isn't already cached.
 * @param {string} address Address of the contract
 * @returns web3 contract instance of the contract
 */
async function getContract (address) {
  const abi = await getAbi(address)
  const contract = new web3.eth.Contract(abi, address)

  return contract
}

/**
 * Gets the BOG token price in USD using the BOG Oracle
 * @param {Number} decimals Wanted decimals on the price, the rest will be rounded
 * @returns BOG token price
 */
async function getBogPrice (decimals) {
  const contractAddress = '0xb9A8e322aff57556a2CC00c89Fad003a61C5ac41'
  const contract = await getContract(contractAddress)

  const priceDecimals = await contract.methods.getDecimals().call()
  const bog = await contract.methods.getSpotPrice().call()
  const bnb = await contract.methods.getBNBSpotPrice().call()
  const bnbUsd = (10 ** priceDecimals) / bnb
  const bogBnb = (10 ** priceDecimals) / bog
  const bogUsd = roundDecimals(bnbUsd * bogBnb, decimals)

  // Cache the price
  cachedBogPrice = bogUsd
  cachedBogPriceTimestamp = Date.now()

  return cachedBogPrice
}

/**
 * Gets a cached BOG token price in USD which is updated periodically if startCaching() has been called.
 * If it's not updated, it'll get the current price (not a cached one), will cache it and return it.
 * @param {Number} decimals Wanted decimals on the price, the rest will be rounded
 * @returns BOG token cached price
 */
async function getCachedBogPrice (decimals) {
  if (Date.now() > cachedBogPriceTimestamp + CACHING_THRESHOLD) await getBogPrice()

  return roundDecimals(cachedBogPrice, decimals)
}

/**
 * Returns staking earnings of a address in $BOG
 * @param {String} address
 * * @param {Number} decimals
 * @returns Staking earnings in $BOG
 */
async function getEarnings (address, decimals) {
  const contractAddress = '0xD7B729ef857Aa773f47D37088A1181bB3fbF0099'
  const contract = await getContract(contractAddress)

  const priceDecimals = await contract.methods.decimals().call()
  const earnings = (await contract.methods.getEarnings(address).call()) / (10 ** priceDecimals) // Earnings in BOG

  return roundDecimals(earnings, decimals)
}

/**
 * Starts caching the price periodically
 */
function startCaching () {
  cachingInterval = setInterval(getBogPrice, CACHING_TIME)
}

/**
 * Stops caching the price periodically
 */
function stopCaching () {
  if (cachingInterval) clearInterval(cachingInterval)
}

/**
 * Converts a ammount BOG to USD
 * @param {Number} bog Ammount of BOG to be converted to USD
 * @returns Equivalent USD ammount
 */
async function bogToUsd (bog) {
  return bog * (await getCachedBogPrice())
}

/**
 * Converts a ammount USD to BOG
 * @param {Number} usd Ammount of USD to be converted to BOG
 * @returns Equivalent BOG ammount
 */
async function usdToBog (usd) {
  return usd / (await getCachedBogPrice())
}

/**
 * Returns the BOG balance of an address
 * @param {String} account
 * @returns BOG balance of account
 */
async function getBogBalance (account) {
  const contractAddress = '0xd7b729ef857aa773f47d37088a1181bb3fbf0099'
  const contract = await getContract(contractAddress)

  const balance = await contract.methods.balanceOf(account).call()
  const decimals = await contract.methods.decimals().call()

  return balance / (10 ** decimals)
}

/**
 * Gets all possible events for a contract
 * @param {String} contract
 * @returns List of possible event names
 */
async function getContractEvents (contract) {
  const abi = await getAbi(contract)
  return abi.filter(e => e.type === 'event').map(e => e.name)
}

module.exports = { getContract, getBogPrice, getCachedBogPrice, getEarnings, roundDecimals, startCaching, stopCaching, bogToUsd, usdToBog, getBogBalance, getContractEvents }
