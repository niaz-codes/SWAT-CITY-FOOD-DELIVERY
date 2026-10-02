import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TabBar, TabItem } from '../../components/TabBar';
import { AdminDashboardScreen } from './AdminDashboard';
import { AdminOrders } from './AdminOrders';
import { AdminManagement } from './AdminManagement';
import { AdminReports } from './AdminReports';
import { AdminSettingsScreen } from './AdminSettings';

const TABS: TabItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  { key: 'orders', label: 'Orders', icon: 'receipt-outline', activeIcon: 'receipt' },
  { key: 'manage', label: 'Manage', icon: 'grid-outline', activeIcon: 'grid' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', activeIcon: 'settings' },
];

export function AdminMainScreen() {
  const [active, setActive] = useState('dashboard');

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <View style={[styles.pane, active === 'dashboard' && styles.active]}>
          <AdminDashboardScreen />
        </View>
        <View style={[styles.pane, active === 'orders' && styles.active]}>
          <AdminOrders embedded />
        </View>
        <View style={[styles.pane, active === 'manage' && styles.active]}>
          <AdminManagement />
        </View>
        <View style={[styles.pane, active === 'reports' && styles.active]}>
          <AdminReports />
        </View>
        <View style={[styles.pane, active === 'settings' && styles.active]}>
          <AdminSettingsScreen />
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