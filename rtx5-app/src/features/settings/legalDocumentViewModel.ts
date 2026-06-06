import type { Ionicons } from '@expo/vector-icons';

export type LegalDocumentSection = {
  title: string;
  body: string;
};

export type LegalDocument = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  updatedLabel: string;
  sections: LegalDocumentSection[];
};

export const PRIVACY_POLICY_DOCUMENT: LegalDocument = {
  title: 'Privacy Policy',
  subtitle: 'How RTX5 handles app data, permissions, and deletion requests.',
  icon: 'shield-checkmark-outline',
  updatedLabel: 'Updated June 4, 2026',
  sections: [
    {
      title: 'Data we collect',
      body: 'When you create or sign in to a demo trading account, RTX5 may send the details you enter, such as name, email, phone number, country, account login, selected broker, and password fields, to the configured broker or trading platform endpoint so the account can be created or authenticated.',
    },
    {
      title: 'Data stored on this device',
      body: 'RTX5 stores app preferences, selected symbols, chart settings, drawing objects, account session state, and saved account credentials locally on the device. Tokens and saved credentials are stored with the platform secure-storage layer where available.',
    },
    {
      title: 'Protected resources',
      body: 'This app version does not request camera, microphone, contacts, photos, or location access for its account and trading flows.',
    },
    {
      title: 'Third parties and sharing',
      body: 'Trading account data is shared with the selected broker or trading platform endpoint needed to operate the requested account features. This app version does not use advertising-network SDKs or tracking SDKs.',
    },
    {
      title: 'Retention and deletion',
      body: 'Device-local preferences remain on the device until you change, remove, or reinstall the app. Account and trading records may be retained by the broker or operator where required for legal, security, financial-service, or audit obligations. You can start an account deletion request from About > Request Account Deletion.',
    },
    {
      title: 'Consent and support',
      body: 'Demo account registration is blocked until you explicitly accept the Terms and Privacy Policy. You can contact support or request account deletion from the About screen.',
    },
  ],
};

export const TERMS_DOCUMENT: LegalDocument = {
  title: 'Terms and Conditions',
  subtitle: 'Key conditions for using the RTX5 mobile trading app.',
  icon: 'document-text-outline',
  updatedLabel: 'Updated June 4, 2026',
  sections: [
    {
      title: 'Trading app use',
      body: 'RTX5 is a frontend mobile application for connecting to supported trading account services. Account creation, authentication, pricing, order execution, and account records are handled by the configured broker or trading platform endpoint.',
    },
    {
      title: 'Demo accounts',
      body: 'Demo accounts are for practice and platform evaluation. Demo balances, prices, execution, leverage, and account settings may differ from live trading conditions.',
    },
    {
      title: 'No investment advice',
      body: 'RTX5 does not provide financial, investment, legal, tax, brokerage, or trading advice. Any market decision remains your responsibility.',
    },
    {
      title: 'Account credentials',
      body: 'You are responsible for keeping account credentials secure and for reviewing all order details before submitting a trade or enabling one-click trading.',
    },
    {
      title: 'Service availability',
      body: 'Network, broker, market, exchange, device, or platform conditions may affect availability, data freshness, and order handling. Review broker terms and policies for service-specific obligations.',
    },
  ],
};

export const getLegalDocument = (document: 'terms' | 'privacy') => (
  document === 'terms' ? TERMS_DOCUMENT : PRIVACY_POLICY_DOCUMENT
);
