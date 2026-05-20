import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform, AppState } from 'react-native';
import { ethers } from 'ethers';
import { Storage } from '../utils/storage';
import {
  WALLETCONNECT_PROJECT_ID,
  CHAIN_ID,
  CHAIN_NAME,
  POLYGON_RPC,
  NATIVE_CURRENCY,
  BLOCK_EXPLORER,
} from '../constants/contract';

const WALLET_KEY = 'sigil_wallet';

type WalletType = 'metamask' | 'walletconnect';

interface PersistedWallet {
  address: string;
  type: WalletType;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isRestoring: boolean;
  error: string | null;
  signer: ethers.Signer | null;
  walletType: WalletType | null;
}

// ── Polygon chain params ────────────────────────────────────────────────────
const POLYGON_CHAIN_PARAMS = {
  chainId: `0x${CHAIN_ID.toString(16)}`,
  chainName: CHAIN_NAME,
  nativeCurrency: NATIVE_CURRENCY,
  rpcUrls: [POLYGON_RPC],
  blockExplorerUrls: [BLOCK_EXPLORER],
};

// ── Ensure MetaMask is on Polygon ───────────────────────────────────────────
async function ensurePolygon(provider: ethers.BrowserProvider): Promise<void> {
  const network = await provider.getNetwork();
  if (Number(network.chainId) === CHAIN_ID) return;
  try {
    await provider.send('wallet_switchEthereumChain', [
      { chainId: POLYGON_CHAIN_PARAMS.chainId },
    ]);
  } catch (err: any) {
    if (err?.code === 4902 || err?.error?.code === 4902) {
      await provider.send('wallet_addEthereumChain', [POLYGON_CHAIN_PARAMS]);
    } else {
      throw err;
    }
  }
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    isRestoring: true,
    error: null,
    signer: null,
    walletType: null,
  });

  const providerRef = useRef<any>(null);

  // ── Persist wallet session ─────────────────────────────────────────────
  const persist = async (address: string, type: WalletType) => {
    await Storage.setItem(WALLET_KEY, JSON.stringify({ address, type } as PersistedWallet));
  };

  const clearPersisted = async () => {
    await Storage.removeItem(WALLET_KEY);
  };

  // ── Hard reset ─────────────────────────────────────────────────────────
  const resetState = useCallback(() => {
    providerRef.current = null;
    setState({
      address: null,
      isConnected: false,
      isConnecting: false,
      isRestoring: false,
      error: null,
      signer: null,
      walletType: null,
    });
  }, []);

  // ── MetaMask connect ───────────────────────────────────────────────────
  const connectMetaMask = useCallback(async (): Promise<{ address: string; signer: ethers.Signer }> => {
    const win = window as any;
    if (!win.ethereum) throw new Error('No wallet found. Install MetaMask.');
    const web3Provider = new ethers.BrowserProvider(win.ethereum);
    await web3Provider.send('eth_requestAccounts', []);
    await ensurePolygon(web3Provider);
    const signer = await web3Provider.getSigner();
    const address = await signer.getAddress();
    providerRef.current = web3Provider;

    // Watch for account/chain changes
    win.ethereum.on('accountsChanged', (accounts: string[]) => {
      if (!accounts.length) {
        clearPersisted();
        resetState();
      } else {
        setState((s) => ({ ...s, address: accounts[0] }));
        persist(accounts[0], 'metamask');
      }
    });
    win.ethereum.on('chainChanged', async () => {
      try {
        const p = new ethers.BrowserProvider(win.ethereum);
        await ensurePolygon(p);
        const sg = await p.getSigner();
        const addr = await sg.getAddress();
        providerRef.current = p;
        setState((s) => ({ ...s, signer: sg, address: addr }));
      } catch {
        clearPersisted();
        resetState();
      }
    });
    win.ethereum.on('disconnect', () => {
      clearPersisted();
      resetState();
    });

    return { address, signer };
  }, [resetState]);

  // ── WalletConnect connect ──────────────────────────────────────────────
  const connectWalletConnect = useCallback(async (): Promise<{ address: string; signer: ethers.Signer }> => {
    if (!WALLETCONNECT_PROJECT_ID) throw new Error('WalletConnect Project ID not configured.');
    // WalletConnect requires a dev build — not available in Expo Go or web preview
    if (Platform.OS === 'web') throw new Error('Use MetaMask to connect on web.');
    let EthereumProvider: any;
    try {
      EthereumProvider = (await import('@walletconnect/ethereum-provider')).EthereumProvider;
    } catch {
      throw new Error('WalletConnect unavailable. Use a dev build for mobile wallet connection.');
    }
    const wcProvider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [CHAIN_ID],
      showQrModal: true,
      metadata: {
        name: 'SIGIL',
        description: 'On-chain content ownership protection',
        url: 'https://sigil.app',
        icons: [],
      },
      rpcMap: { [CHAIN_ID]: POLYGON_RPC },
    });

    await wcProvider.connect();
    providerRef.current = wcProvider;

    const ethersProvider = new ethers.BrowserProvider(wcProvider as any);
    const signer = await ethersProvider.getSigner();
    const address = await signer.getAddress();

    // Watch for WC session events
    wcProvider.on('accountsChanged', (accounts: string[]) => {
      if (!accounts.length) {
        clearPersisted();
        resetState();
      } else {
        setState((s) => ({ ...s, address: accounts[0] }));
        persist(accounts[0], 'walletconnect');
      }
    });
    wcProvider.on('disconnect', () => {
      clearPersisted();
      resetState();
    });
    wcProvider.on('session_delete', () => {
      clearPersisted();
      resetState();
    });

    return { address, signer };
  }, [resetState]);

  // ── Public connect ─────────────────────────────────────────────────────
  const connect = useCallback(async (preferType?: WalletType) => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      // On web preview always use MetaMask (WalletConnect needs dev build)
      const type: WalletType =
        Platform.OS === 'web' ? 'metamask' : (preferType ?? 'walletconnect');

      let address: string;
      let signer: ethers.Signer;

      if (type === 'metamask') {
        ({ address, signer } = await connectMetaMask());
      } else {
        ({ address, signer } = await connectWalletConnect());
      }

      await persist(address, type);
      setState({
        address,
        isConnected: true,
        isConnecting: false,
        isRestoring: false,
        error: null,
        signer,
        walletType: type,
      });
    } catch (err: any) {
      setState((s) => ({
        ...s,
        isConnecting: false,
        isRestoring: false,
        error: err?.message || 'Connection failed',
      }));
    }
  }, [connectMetaMask, connectWalletConnect]);

  // ── Disconnect ─────────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    try {
      if (providerRef.current?.disconnect) await providerRef.current.disconnect();
      // Remove MetaMask listeners
      if (Platform.OS === 'web') {
        const win = window as any;
        win.ethereum?.removeAllListeners?.();
      }
    } catch {}
    await clearPersisted();
    resetState();
  }, [resetState]);

  // ── Auto-restore on mount ──────────────────────────────────────────────
  const restore = useCallback(async () => {
    try {
      const raw = await Storage.getItem(WALLET_KEY);
      if (!raw) {
        setState((s) => ({ ...s, isRestoring: false }));
        return;
      }
      const saved: PersistedWallet = JSON.parse(raw);

      if (saved.type === 'metamask' && Platform.OS === 'web') {
        const win = window as any;
        if (!win.ethereum) throw new Error('MetaMask not found');
        const web3Provider = new ethers.BrowserProvider(win.ethereum);
        // Check if already authorized (no popup)
        const accounts: string[] = await web3Provider.send('eth_accounts', []);
        if (!accounts.length || accounts[0].toLowerCase() !== saved.address.toLowerCase()) {
          throw new Error('MetaMask session expired');
        }
        await ensurePolygon(web3Provider);
        const signer = await web3Provider.getSigner();
        const address = await signer.getAddress();
        providerRef.current = web3Provider;

        // Re-attach listeners
        win.ethereum.on('accountsChanged', (accs: string[]) => {
          if (!accs.length) { clearPersisted(); resetState(); }
          else { setState((s) => ({ ...s, address: accs[0] })); persist(accs[0], 'metamask'); }
        });
        win.ethereum.on('chainChanged', async () => {
          try {
            const p = new ethers.BrowserProvider(win.ethereum);
            await ensurePolygon(p);
            const sg = await p.getSigner();
            providerRef.current = p;
            sg.getAddress().then((addr) => setState((s) => ({ ...s, signer: sg, address: addr })));
          } catch { clearPersisted(); resetState(); }
        });
        win.ethereum.on('disconnect', () => { clearPersisted(); resetState(); });

        setState({ address, isConnected: true, isConnecting: false, isRestoring: false, error: null, signer, walletType: 'metamask' });

      } else if (saved.type === 'walletconnect') {
        // Attempt silent WC session restore
        try {
          if (Platform.OS === 'web') throw new Error('WC not available on web');
          const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
          const wcProvider = await EthereumProvider.init({
            projectId: WALLETCONNECT_PROJECT_ID,
            chains: [CHAIN_ID],
            showQrModal: false, // silent restore — no modal
            metadata: {
              name: 'SIGIL',
              description: 'On-chain content ownership protection',
              url: 'https://sigil.app',
              icons: [],
            },
            rpcMap: { [CHAIN_ID]: POLYGON_RPC },
          });

          // WC has an active session if accounts are populated without calling connect()
          if (wcProvider.accounts?.length) {
            providerRef.current = wcProvider;
            const ethersProvider = new ethers.BrowserProvider(wcProvider as any);
            const signer = await ethersProvider.getSigner();
            const address = await signer.getAddress();

            wcProvider.on('accountsChanged', (accs: string[]) => {
              if (!accs.length) { clearPersisted(); resetState(); }
              else { setState((s) => ({ ...s, address: accs[0] })); persist(accs[0], 'walletconnect'); }
            });
            wcProvider.on('disconnect', () => { clearPersisted(); resetState(); });
            wcProvider.on('session_delete', () => { clearPersisted(); resetState(); });

            setState({ address, isConnected: true, isConnecting: false, isRestoring: false, error: null, signer, walletType: 'walletconnect' });
          } else {
            throw new Error('No active WalletConnect session');
          }
        } catch {
          // WC session gone — restore address-only so UI shows it but marks needs-reconnect
          setState({ address: saved.address, isConnected: false, isConnecting: false, isRestoring: false, error: null, signer: null, walletType: 'walletconnect' });
        }
      } else {
        throw new Error('Unknown wallet type');
      }
    } catch {
      await clearPersisted();
      setState((s) => ({ ...s, isRestoring: false }));
    }
  }, [resetState]);

  // Run restore once on mount
  useEffect(() => {
    restore();
  }, []);

  // Re-check on app foregrounding
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && !state.isConnected && !state.isRestoring) {
        restore();
      }
    });
    return () => sub.remove();
  }, [state.isConnected, state.isRestoring, restore]);

  const formatAddress = useCallback(
    () => (state.address ? `${state.address.slice(0, 6)}...${state.address.slice(-4)}` : ''),
    [state.address]
  );

  return {
    ...state,
    connect,
    disconnect,
    formatAddress,
    /** true when address is known but signer is gone (needs tap to reconnect) */
    needsReconnect: !!state.address && !state.isConnected && !state.isRestoring,
  };
}
