/**
 * Utilities Module
 * Provides validation, number precision, and helper functions
 */

const Utils = (function() {
    
    // ==================== NUMBER PRECISION ====================
    
    /**
     * Round to specified decimal places with precision
     */
    function roundTo(value, decimals = 3) {
        if (typeof value !== 'number' || isNaN(value)) return 0;
        const multiplier = Math.pow(10, decimals);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * Floor to specified decimal places
     */
    function floorTo(value, decimals = 3) {
        if (typeof value !== 'number' || isNaN(value)) return 0;
        const multiplier = Math.pow(10, decimals);
        return Math.floor(value * multiplier) / multiplier;
    }

    /**
     * Safe decimal subtraction to avoid floating point errors
     */
    function safeSubtract(a, b) {
        return roundTo(a - b, 8);
    }

    /**
     * Safe decimal multiplication
     */
    function safeMultiply(a, b) {
        return roundTo(a * b, 8);
    }

    /**
     * Safe decimal division
     */
    function safeDivide(a, b) {
        if (b === 0) return 0;
        return roundTo(a / b, 8);
    }

    // ==================== VALIDATION ====================

    /**
     * Validate and parse number input
     */
    function parseNumber(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Validate positive number
     */
    function isPositiveNumber(value) {
        const num = parseNumber(value);
        return num > 0 && isFinite(num);
    }

    /**
     * Validate Hive username format
     */
    function isValidUsername(username) {
        if (!username || typeof username !== 'string') return false;
        
        // Hive username rules: 3-16 characters, lowercase letters, numbers, hyphens, dots
        const regex = /^[a-z0-9\-\.]{3,16}$/;
        return regex.test(username);
    }

    /**
     * Sanitize username input
     */
    function sanitizeUsername(username) {
        if (!username) return '';
        return username.toString().toLowerCase().trim();
    }

    /**
     * Validate swap amount
     */
    function validateSwapAmount(amount, balance, minAmount = 0.001) {
        const errors = [];
        const num = parseNumber(amount);

        if (!isPositiveNumber(num)) {
            errors.push('Amount must be greater than 0');
        }

        if (num < minAmount) {
            errors.push(`Minimum swap amount is ${minAmount}`);
        }

        if (num > balance) {
            errors.push('Insufficient balance');
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            amount: num
        };
    }

    // ==================== ERROR HANDLING ====================

    /**
     * Custom error types
     */
    class ValidationError extends Error {
        constructor(message) {
            super(message);
            this.name = 'ValidationError';
        }
    }

    class APIError extends Error {
        constructor(message, endpoint = null) {
            super(message);
            this.name = 'APIError';
            this.endpoint = endpoint;
        }
    }

    class TransactionError extends Error {
        constructor(message, transactionId = null) {
            super(message);
            this.name = 'TransactionError';
            this.transactionId = transactionId;
        }
    }

    /**
     * Handle errors consistently
     */
    function handleError(error, context = '') {
        const prefix = context ? `[${context}] ` : '';
        
        if (error instanceof ValidationError) {
            console.warn(prefix + error.message);
            return { type: 'validation', message: error.message };
        }
        
        if (error instanceof APIError) {
            console.error(prefix + error.message, error.endpoint);
            return { type: 'api', message: error.message, endpoint: error.endpoint };
        }
        
        if (error instanceof TransactionError) {
            console.error(prefix + error.message, error.transactionId);
            return { type: 'transaction', message: error.message, txId: error.transactionId };
        }
        
        console.error(prefix + 'Unexpected error:', error);
        return { type: 'unknown', message: error.message || 'An unexpected error occurred' };
    }

    // ==================== ASYNC HELPERS ====================

    /**
     * Retry async function with exponential backoff
     */
    async function retry(fn, maxAttempts = 3, delayMs = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt < maxAttempts) {
                    const delay = delayMs * Math.pow(2, attempt - 1);
                    console.log(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms...`);
                    await sleep(delay);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Sleep/delay helper
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create debounced function
     */
    function debounce(func, waitMs = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, waitMs);
        };
    }

    /**
     * Create throttled function
     */
    function throttle(func, limitMs = 1000) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limitMs);
            }
        };
    }

    /**
     * Timeout wrapper for promises
     */
    function withTimeout(promise, timeoutMs = 8000) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    // ==================== DATA HELPERS ====================

    /**
     * Deep clone object
     */
    function deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Check if object is empty
     */
    function isEmpty(obj) {
        if (!obj) return true;
        return Object.keys(obj).length === 0;
    }

    /**
     * Format large numbers with commas
     */
    function formatNumber(num, decimals = 3) {
        if (typeof num !== 'number') return '0';
        return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Format timestamp to readable date
     */
    function formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    /**
     * Escape a value for interpolation into HTML (text or attribute).
     * Anything that came from the chain, a node, or localStorage goes through
     * this before it reaches innerHTML.
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Pull a transaction id out of a wallet/broadcast result.
     *
     * Keychain and Hive Auth have returned it in several shapes over time:
     * a bare string, or an object carrying id / tx_id / transaction_id.
     * Returns a string or null - never the raw object, which would otherwise
     * be stored as the swap's txIdSent and break history matching/rendering.
     */
    function extractTxId(result) {
        if (typeof result === 'string') {
            return result.trim() || null;
        }
        if (result && typeof result === 'object') {
            const candidate = result.id || result.tx_id || result.transaction_id ||
                (result.result && extractTxId(result.result));
            return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
        }
        return null;
    }

    /**
     * Hive API timestamps are UTC without a timezone suffix
     * ("2026-10-03T12:34:56"). Parse them as UTC, not local time.
     */
    function parseChainTime(time) {
        if (!time) return NaN;
        return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(time) ? time : time + 'Z').getTime();
    }

    // ==================== PUBLIC API ====================

    return {
        // Number precision
        roundTo,
        floorTo,
        safeSubtract,
        safeMultiply,
        safeDivide,
        
        // Validation
        parseNumber,
        isPositiveNumber,
        isValidUsername,
        sanitizeUsername,
        validateSwapAmount,
        
        // Error handling
        ValidationError,
        APIError,
        TransactionError,
        handleError,
        
        // Async helpers
        retry,
        sleep,
        debounce,
        throttle,
        withTimeout,
        
        // Data helpers
        deepClone,
        isEmpty,
        formatNumber,
        formatDate,
        escapeHtml,
        extractTxId,
        parseChainTime
    };
})();
