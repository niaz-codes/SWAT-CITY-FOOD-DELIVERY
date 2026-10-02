import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TabBar, TabItem } from '../../components/TabBar';
import { FoodHomeScreen } from './FoodHome';
import { RideBookingScreen } from './RideBooking';
import { ActivitiesScreen } from './Activities';
import { WalletScreen } from './Wallet';
import { ProfileScreen } from './Profile';

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'ride', label: 'Ride', icon: 'bicycle-outline', activeIcon: 'bicycle' },
  { key: 'activity', label: 'Activity', icon: 'time-outline', activeIcon: 'time' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export function MainShellScreen() {
  const [active, setActive] = useState('home');

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={[styles.pane, active === 'home' && styles.active]}>
          <FoodHomeScreen />
        </View>
        <View style={[styles.pane, active === 'ride' && styles.active]}>
          <RideBookingScreen />
        </View>
        <View style={[styles.pane, active === 'activity' && styles.active]}>
          <ActivitiesScreen embedded />
        </View>
        <View style={[styles.pane, active === 'wallet' && styles.active]}>
          <WalletScreen embedded />
        </View>
        <View style={[styles.pane, active === 'profile' && styles.active]}>
          <ProfileScreen embedded />
        </View>
      </View>
      <TabBar items={TABS} activeKey={active} onChange={setActive} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  pane: { flex: 1, display: 'none' },
  active: { display: 'flex' },
});