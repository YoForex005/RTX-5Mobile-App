import { router } from 'expo-router';
import { Alert } from 'react-native';

import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { useUserPreferences } from '../../state/userPreferences';
import {
  clearPendingTradeAuthIntent,
  savePendingTradeAuthIntent,
  shouldRequestOrrnnDemoTradeAuth,
  type TradeAuthIntent,
} from './tradeAuthGate';

const TRADE_AUTH_PROMPT_TITLE = 'Trading account required';
const TRADE_AUTH_PROMPT_MESSAGE =
  'Create a demo account to place the trade, or log in if you already have credentials.';

let tradeAuthPromptVisible = false;

const releaseTradeAuthPrompt = () => {
  tradeAuthPromptVisible = false;
};

const cancelTradeAuthPrompt = () => {
  clearPendingTradeAuthIntent();
  releaseTradeAuthPrompt();
};

/**
 * Returns true when the action was intercepted. Callers must return
 * immediately so no prefetch, optimistic update, or order request can start.
 */
export function requestOrrnnDemoTradeAuth(intent: TradeAuthIntent): boolean {
  const preferences = useUserPreferences.getState();
  const activeSession = captureActiveBrokerSession();
  const shouldPrompt = shouldRequestOrrnnDemoTradeAuth({
    selectedBrokerId: preferences.brokerId,
    isLoggedIn: preferences.isLoggedIn,
    accountId: preferences.accountDetails?.id,
    accessToken: preferences.accountDetails?.credentials?.accessToken,
    activeBrokerId: activeSession?.session.brokerId,
    activeAccountLogin: activeSession?.session.accountLogin,
    activeAccessToken: activeSession?.credentials.accessToken,
  });

  if (!shouldPrompt) {
    return false;
  }

  savePendingTradeAuthIntent(intent);
  if (tradeAuthPromptVisible) {
    return true;
  }

  tradeAuthPromptVisible = true;
  Alert.alert(
    TRADE_AUTH_PROMPT_TITLE,
    TRADE_AUTH_PROMPT_MESSAGE,
    [
      {
        text: 'Not now',
        style: 'cancel',
        onPress: cancelTradeAuthPrompt,
      },
      {
        text: 'Log In',
        onPress: () => {
          releaseTradeAuthPrompt();
          router.push('/login');
        },
      },
      {
        text: 'Create Demo Account',
        onPress: () => {
          releaseTradeAuthPrompt();
          router.push('/register-entry');
        },
      },
    ],
    {
      cancelable: true,
      onDismiss: cancelTradeAuthPrompt,
    },
  );
  return true;
}
