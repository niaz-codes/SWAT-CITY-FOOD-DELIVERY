export const spacing = {
  xxs: 2,
  xs: 4,
  s: 8,
  sm: 12,
  m: 16,
  md: 20,
  l: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  huge: 56,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  card: 18,
  image: 14,
  pill: 999,
} as const;

export const sizes = {
  button: 54,
  buttonSm: 44,
  buttonLg: 60,
  input: 52,
  tabBar: 64,
  header: 56,
  touchMin: 44,
  avatar: 44,
  avatarLg: 56,
  iconButton: 44,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;