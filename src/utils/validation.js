const z = require('zod');
const { ethers } = require('ethers');
const Decimal = require('decimal.js');

// Define validation schemas
const schemas = {
  // Address validation
  ethAddress: z.string().refine(
    (address) => ethers.isAddress(address),
    { message: "Invalid Ethereum address format" }
  ),
  
  // Transaction hash validation
  txHash: z.string().regex(
    /^0x([A-Fa-f0-9]{64})$/,
    { message: "Invalid transaction hash format" }
  ),
  
  // Amount validation
  amount: z.string().refine(
    (amount) => {
      try {
        const decimal = new Decimal(amount);
        return decimal.greaterThan(0);
      } catch (error) {
        return false;
      }
    },
    { message: "Amount must be a positive number" }
  ),
  
  // Fiat type validation
  fiatType: z.enum(['USD', 'UAH'], {
    errorMap: () => ({ message: "Fiat type must be either USD or UAH" }),
  }),
  
  // Username validation
  username: z.string().min(5).max(32),
  
  // Command validation helpers
  withdrawCommand: z.string().refine(
    (cmd) => {
      const parts = cmd.split(',');
      return parts.length === 2 && parts[0].trim() !== '' && parts[1].trim() !== '';
    },
    { message: "Invalid format. Use: /withdraw amount,walletAddress" }
  ),
  
  exchangeCommand: z.string().refine(
    (cmd) => {
      const parts = cmd.split(',');
      return parts.length === 2 && parts[0].trim() !== '' && parts[1].trim() !== '';
    },
    { message: "Invalid format. Use: /exchange amount,fiatType" }
  )
};

// Validation functions
const validation = {
  /**
   * Validate Ethereum address
   * @param {string} address - Ethereum address to validate
   * @returns {boolean} - Whether address is valid
   */
  isValidAddress: (address) => {
    try {
      schemas.ethAddress.parse(address);
      return true;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Validate transaction hash
   * @param {string} hash - Transaction hash to validate
   * @returns {boolean} - Whether hash is valid
   */
  isValidTxHash: (hash) => {
    try {
      schemas.txHash.parse(hash);
      return true;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Validate amount
   * @param {string} amount - Amount to validate
   * @returns {boolean} - Whether amount is valid
   */
  isValidAmount: (amount) => {
    try {
      schemas.amount.parse(amount);
      return true;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Validate fiat type
   * @param {string} fiatType - Fiat type to validate
   * @returns {boolean} - Whether fiat type is valid
   */
  isValidFiatType: (fiatType) => {
    try {
      schemas.fiatType.parse(fiatType.toUpperCase());
      return true;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Parse withdraw command
   * @param {string} command - Withdraw command to parse
   * @returns {Object|null} - Parsed command or null if invalid
   */
  parseWithdrawCommand: (command) => {
    try {
      schemas.withdrawCommand.parse(command);
      const [amount, address] = command.split(',').map(part => part.trim());
      if (validation.isValidAmount(amount) && validation.isValidAddress(address)) {
        return { amount, address };
      }
      return null;
    } catch (error) {
      return null;
    }
  },
  
  /**
   * Parse exchange command
   * @param {string} command - Exchange command to parse
   * @returns {Object|null} - Parsed command or null if invalid
   */
  parseExchangeCommand: (command) => {
    try {
      schemas.exchangeCommand.parse(command);
      const [amount, fiatType] = command.split(',').map(part => part.trim());
      if (validation.isValidAmount(amount) && validation.isValidFiatType(fiatType)) {
        return { amount, fiatType: fiatType.toUpperCase() };
      }
      return null;
    } catch (error) {
      return null;
    }
  }
};

module.exports = validation;