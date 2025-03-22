require('dotenv').config();

module.exports = {
  // Bot configuration
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  adminTelegramToken: process.env.ADMIN_TELEGRAM_BOT_TOKEN,
  adminChatId: process.env.ADMIN_CHAT_ID,
  
  // Blockchain configuration
  blockchain: {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
    usdtContractAddress: process.env.USDT_CONTRACT_ADDRESS,
    depositAddress: process.env.DEPOSIT_ADDRESS,
    privateKey: process.env.PRIVATE_KEY,
  },
  
  // Transaction configuration
  transactions: {
    withdrawalFee: parseFloat(process.env.WITHDRAWAL_FEE || '0.4'),
    minConfirmations: parseInt(process.env.MIN_CONFIRMATIONS || '5'),
  },
  
  // Environment
  environment: process.env.NODE_ENV || 'development',
  
  // Default exchange rates
  defaultRates: {
    usd: 1.0,
    uah: 39.5
  }
};