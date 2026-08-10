export const getChainLogoUrl = (chain: string) => {
  if (!chain) return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
  if (chain.toLowerCase() === 'robinhood' || chain.toLowerCase() === 'robinhood_testnet') {
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjQ0FGRjAwIi8+PHBhdGggZmlsbD0iIzIwMUUxQSIgZD0iTTIuODQgMjRoLjUzYy4wOTYgMCAuMTkyLS4wNDguMjI0LS4xMjhDNy41OTEgMTMuNjk2IDExLjk0IDguNjU2IDE0LjY3IDUuNjM4Yy4xMTItLjEyOC4wNjQtLjIyNS0uMDk2LS4yMjVoLTQuODhhLjU1LjU1IDAgMCAwLS40NS4yMjVMNS43NDYgOS45NzJjLS41MTQuNjQyLS42NDIgMS4yMzYtLjY0MiAyLjA4NnY0LjQzYy0xLjE0IDMuMTk0LTEuODYyIDUuMzYxLTIuMzkyIDcuMzJjLS4wMzIuMTI1LjAxNi4xOTIuMTI5LjE5Mk0yMC40NDcuNjQ2Yy0uNzU0LS44MDItNC4xNTctLjgzNC01LjczLS4yMjRhMyAzIDAgMCAwLS43ODYuNDY1YTQxIDQxIDAgMCAwLTMuMzIzIDMuMTc4Yy0uMTEyLjExMy0uMDY0LjIyNS4wOTcuMjI1aDUuNDA5Yy40OTcgMCAuNzg2LjI4OS43ODYuNzg2djYuMWMwIC4xNi4xMjguMjA4LjIyNS4wNjRsMy4yNTgtNC4yNTRjLjUzLS42OS42OS0uODk4LjgzNS0xLjg2MWMuMTkyLTEuNDEzLjA4LTMuNTgtLjc3LTQuNDc5bS02Ljk4MiAxNi4xOGwyLjIzMS0zLjY3NmEuNy43IDAgMCAwIC4wNjQtLjI5VjYuNzNjMC0uMTYtLjExMi0uMjI1LS4yMjQtLjA5N2MtMy4zNTUgMy43NC01Ljk3MSA3LjY3Mi04LjM5NSAxMi40MDdjLS4wNi4xMi4wMTYuMjI1LjE2LjE3N2w1LjAwOS0xLjU0Yy41NjUtLjE3NC44ODItLjQwMiAxLjE1NS0uODUyIi8+PC9zdmc+';
  }
  
  const twName: any = {
    ethereum: 'ethereum',
    base: 'base',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    bsc: 'smartchain',
    polygon: 'polygon',
    sepolia: 'ethereum',
    base_sepolia: 'base',
    arbitrum_sepolia: 'arbitrum',
    optimism_sepolia: 'optimism'
  };
  const mapped = twName[chain.toLowerCase()] || 'ethereum';
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${mapped}/info/logo.png`;
};

export const getChainId = (chain: string) => {
  switch (chain.toLowerCase()) {
    case 'ethereum': return 1;
    case 'base': return 8453;
    case 'arbitrum': return 42161;
    case 'optimism': return 10;
    case 'bsc': return 56;
    case 'polygon': return 137;
    case 'sepolia': return 11155111;
    case 'base_sepolia': return 84532;
    case 'arbitrum_sepolia': return 421614;
    case 'optimism_sepolia': return 11155420;
    case 'robinhood': return 4663;
    case 'robinhood_testnet': return 46630;
    default: return 1;
  }
};

export const getTokenLogoUrl = (chain: string, address: string, isNative: boolean) => {
  if (isNative) {
    if (chain === 'polygon') return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png';
    if (chain === 'bsc') return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png';
    return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png';
  }
  const chainId = getChainId(chain);
  return `https://logos.covalenthq.com/tokens/${chainId}/${address.toLowerCase()}.png`;
};

export const getRouterLogoUrl = (router: string) => {
  switch (router.toLowerCase()) {
    case '1inch':
    case 'inch_key': return '/routers/1inch.png';
    case '0x':
    case 'zero_x_key': return '/routers/0x.png';
    case 'kyberswap': return '/routers/kyberswap.png';
    case 'openocean':
    case 'openocean_key': return '/routers/openocean.png';
    case 'lifi':
    case 'lifi_key': return '/routers/lifi.png';
    case 'relay':
    case 'relay_key': return '/routers/relay.png';
    case 'cmc_key':
    case 'cmc_pro_key': return '/routers/cmc.png';
    case 'coingecko_key':
    case 'coingecko_pro_key': return '/routers/coingecko.png';

    case 'zerion_key': return '/routers/zerion.png';
    case 'auto': return ''; // Handled by NyxoraLogo
    default: return '';
  }
};
