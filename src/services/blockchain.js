const { ethers } = require('ethers');
const Decimal = require('decimal.js');
const config = require('../config/config');
const logger = require('../utils/logger');
const Transaction = require('../models/Transaction');

// ERC20 ABI for USDT
const ERC20_ABI = [
  // Only the functions we need
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 value) returns (bool)',
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)'
];

// Initialize blockchain connection
const provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
const usdtContract = new ethers.Contract(
  config.blockchain.usdtContractAddress,
  ERC20_ABI,
  wallet
);

/**
 * Convert amount to token decimals
 * @param {string} amount - Human-readable amount
 * @returns {Promise<ethers.BigNumber>} - Amount in token decimals
 */
async function parseTokenAmount(amount) {
  const decimals = await usdtContract.decimals();
  return ethers.parseUnits(amount, decimals);
}

/**
 * Format token amount to human-readable format
 * @param {ethers.BigNumber} amount - Amount in token decimals
 * @returns {Promise<string>} - Human-readable amount
 */
async function formatTokenAmount(amount) {
  const decimals = await usdtContract.decimals();
  return ethers.formatUnits(amount, decimals);
}

/**
 * Get wallet balance
 * @returns {Promise<string>} - Wallet balance in USDT
 */
async function getWalletBalance() {
  try {
    const balance = await usdtContract.balanceOf(config.blockchain.depositAddress);
    return formatTokenAmount(balance);
  } catch (error) {
    logger.error('Failed to get wallet balance:', error);
    throw error;
  }
}

/**
 * Verify deposit transaction
 * @param {string} txHash - Transaction hash
 * @param {string} expectedAmount - Expected amount in USDT
 * @returns {Promise<Object>} - Verification result
 */
async function verifyDepositTransaction(txHash, expectedAmount) {
  try {
    logger.info(`Verifying deposit transaction: ${txHash}`);
    
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      logger.warn(`Transaction receipt not found for hash: ${txHash}`);
      return { 
        verified: false, 
        reason: 'Transaction not found or not yet confirmed' 
      };
    }
    
    // Check confirmations
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    
    if (confirmations < config.transactions.minConfirmations) {
      logger.warn(`Insufficient confirmations for transaction: ${txHash}, current: ${confirmations}, required: ${config.transactions.minConfirmations}`);
      return { 
        verified: false, 
        reason: `Insufficient confirmations: ${confirmations}/${config.transactions.minConfirmations}` 
      };
    }
    
    // Parse logs for Transfer event
    const transferEvent = receipt.logs
      .map(log => {
        try {
          return {
            parsed: usdtContract.interface.parseLog({
              topics: log.topics,
              data: log.data
            }),
            address: log.address.toLowerCase()
          };
        } catch (e) {
          return null;
        }
      })
      .filter(log => 
        log !== null && 
        log.parsed.name === 'Transfer' && 
        log.address.toLowerCase() === config.blockchain.usdtContractAddress.toLowerCase()
      )[0];
    
    if (!transferEvent) {
      logger.warn(`No USDT transfer event found in transaction: ${txHash}`);
      return { 
        verified: false, 
        reason: 'No USDT transfer event found in transaction' 
      };
    }
    
    // Verify recipient is our deposit address
    const recipient = transferEvent.parsed.args[1].toLowerCase();
    if (recipient !== config.blockchain.depositAddress.toLowerCase()) {
      logger.warn(`Wrong recipient for transaction: ${txHash}, expected: ${config.blockchain.depositAddress}, got: ${recipient}`);
      return { 
        verified: false, 
        reason: 'Transaction recipient is not the system deposit address' 
      };
    }
    
    // Verify amount
    const amount = await formatTokenAmount(transferEvent.parsed.args[2]);
    const amountDecimal = new Decimal(amount);
    const expectedDecimal = new Decimal(expectedAmount);
    
    if (!amountDecimal.equals(expectedDecimal)) {
      logger.warn(`Amount mismatch for transaction: ${txHash}, expected: ${expectedAmount}, got: ${amount}`);
      return { 
        verified: false, 
        reason: `Amount mismatch: expected ${expectedAmount}, got ${amount}` 
      };
    }
    
    // All verifications passed
    logger.info(`Transaction verified successfully: ${txHash}`);
    return { 
      verified: true, 
      amount,
      confirmations
    };
  } catch (error) {
    logger.error(`Error verifying transaction ${txHash}:`, error);
    return { 
      verified: false, 
      reason: `Error verifying transaction: ${error.message}` 
    };
  }
}

/**
 * Process withdrawal transaction
 * @param {Object} transaction - Transaction object
 * @returns {Promise<Object>} - Processing result
 */
async function processWithdrawal(transaction) {
  try {
    logger.info(`Processing withdrawal: ${transaction.id}`);
    
    // Update transaction status
    transaction.status = 'processing';
    await transaction.save();
    
    // Parse amount
    const amountToSend = await parseTokenAmount(transaction.amount);
    
    // Get gas price estimate
    const gasPrice = await provider.getFeeData();
    
    // Estimate gas for the transaction
    const gasEstimate = await usdtContract.transfer.estimateGas(
      transaction.walletAddress,
      amountToSend
    );
    
    // Send transaction
    const tx = await usdtContract.transfer(
      transaction.walletAddress,
      amountToSend,
      {
        gasLimit: Math.floor(gasEstimate * 1.2), // Add 20% buffer
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
      }
    );
    
    logger.info(`Withdrawal transaction sent: ${tx.hash}`);
    
    // Update transaction with hash
    transaction.txHash = tx.hash;
    await transaction.save();
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    // Update transaction status
    transaction.status = 'completed';
    transaction.completedAt = new Date();
    transaction.confirmations = 1; // Just confirmed
    await transaction.save();
    
    logger.info(`Withdrawal completed: ${transaction.id}, tx hash: ${tx.hash}`);
    
    return {
      success: true,
      txHash: tx.hash
    };
  } catch (error) {
    logger.error(`Error processing withdrawal ${transaction.id}:`, error);
    
    // Update transaction status
    transaction.status = 'failed';
    transaction.adminNotes = `Failed: ${error.message}`;
    await transaction.save();
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getWalletBalance,
  verifyDepositTransaction,
  processWithdrawal
};