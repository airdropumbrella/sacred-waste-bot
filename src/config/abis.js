/**
 * ABI definitions for Sacred Waste contracts
 *
 * ✅ VERIFIED from real transaction:
 * https://basescan.org/tx/0x6c83e74ee52c9ded3cfe81db2053fc91b7cc0cdfb1e12ce13db53481ea0a8523
 *
 * Sacrifice Contract : 0x9AFeb0e58fa2c76404C3c45eF7Ca5c0503cBaa53 (Base mainnet)
 * Function selector  : 0xf031abb8
 * Params             : (address tokenAddress, uint256 amount)
 * Gas used           : 229,640
 * What it does       : wraps ERC-20 → ERC-721 (WRAP NFT) → sends to The Pit
 */

// Known selector - used for raw calldata construction
export const SACRIFICE_SELECTOR = '0xf031abb8';

// Standard ERC-20 ABI (token)
export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

/**
 * Sacred Waste Sacrifice Contract ABI
 * ✅ Verified: selector 0xf031abb8 takes (address tokenAddress, uint256 amount)
 * We use raw calldata as primary method to bypass name uncertainty.
 */
export const SACRIFICE_ABI = [
  // Exact signature (name may differ on-chain but params are confirmed)
  'function sacrifice(address tokenAddress, uint256 amount) external',
  'function wrapAndSacrifice(address tokenAddress, uint256 amount) external',
  'function submitSacrifice(address tokenAddress, uint256 amount) external',
  // Events
  'event Sacrificed(address indexed user, address indexed token, uint256 amount, uint256 tokenId)',
  'event TokenWrapped(address indexed user, address indexed token, uint256 amount)',
];
