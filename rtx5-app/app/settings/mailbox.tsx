import { DeferredRouteModule } from '../../src/ui/components/DeferredRouteMount';

const loadMailboxScreen = () => import('../../src/features/settings/MailboxScreen').then((module) => module.MailboxScreen);

export default function MailboxRoute() {
  return <DeferredRouteModule load={loadMailboxScreen} title="Mailbox" />;
}
