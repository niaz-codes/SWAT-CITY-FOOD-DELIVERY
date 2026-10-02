import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TabBar, TabItem } from '../../components/TabBar';
import { riderApi } from '../../services/api';
import { RiderHomeScreen } from './RiderHome';
import { RiderRequestsScreen } from './RiderRequests';
import { RiderEarningsScreen } from './RiderEarnings';
import { RiderWalletScreen } from './RiderWallet';
import { RiderProfileScreen } from './RiderProfile';

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'requests', label: 'Requests', icon: 'mail-outline', activeIcon: 'mail' },
  { key: 'earnings', label: 'Earnings', icon: 'trending-up-outline', activeIcon: 'trending-up' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export function RiderMainShellScreen() {
  const [active, setActive] = useState('home');
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    riderApi.getRequests().then((requests) => setBadges({ requests: requests.length })).catch(() => {});
  }, []);

  const items: TabItem[] = TABS.map((t) => (badges[t.key] ? { ...t, badge: badges[t.key] } : t));

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={[styles.pane, active === 'home' && styles.active]}>
          <RiderHomeScreen onGoToRequests={() => setActive('requests')} onGoToProfile={() => setActive('profile')} />
        </View>
        <View style={[styles.pane, active === 'requests' && styles.active]}>
          <RiderRequestsScreen embedded />
        </View>
        <View style={[styles.pane, active === 'earnings' && styles.active]}>
          <RiderEarningsScreen embedded />
        </View>
        <View style={[styles.pane, active === 'wallet' && styles.active]}>
          <RiderWalletScreen embedded />
        </View>
        <View style={[styles.pane, active === 'profile' && styles.active]}>
          <RiderProfileScreen embedded />
        </View>
      </View>
      <TabBar items={items} activeKey={active} onChange={setActive} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  pane: { flex: 1, display: 'none' },
  active: { display: 'flex' },
});