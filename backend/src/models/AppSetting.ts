import { defineModel } from '../db/model';

// Key/value app-wide settings edited from the admin panel.

export interface AppSetting {
  _id: string;

  key: string;
  value: any;
  label?: string | null;
  description?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const AppSettingModel = defineModel<AppSetting>({
  table: 'app_settings',
  columns: ['key', 'value', 'label', 'description', 'createdAt', 'updatedAt'],
});
