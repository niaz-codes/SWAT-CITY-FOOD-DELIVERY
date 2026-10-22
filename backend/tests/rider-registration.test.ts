import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emailOtpVerifySchema,
  registerSchema,
  riderRegisterSchema,
} from '../src/validations/auth';

/**
 * The rider onboarding request is `multipart/form-data`, so every value arrives
 * as a string - exactly like this payload, which mirrors what the Android app
 * sends.
 */
const APP_PAYLOAD = {
  name: 'Ahmad Khan',
  phone: '03001234567',
  email: 'ahmad.khan@example.com',
  password: 'SwatCity2026',
  cnic: '12345-1234567-1',
  baseCity: 'Mingora',
  vehicleType: 'bike',
  vehiclePlate: 'SWAT-1234',
  experienceYears: '3',
  latitude: '34.8912',
  longitude: '72.5378',
  locationLabel: 'Mingora Bazaar',
};

describe('rider registration payload', () => {
  it('accepts the payload the app sends', () => {
    const parsed = riderRegisterSchema.parse(APP_PAYLOAD);
    assert.equal(parsed.experienceYears, 3);
    assert.equal(parsed.latitude, 34.8912);
    assert.equal(parsed.longitude, 72.5378);
    assert.equal(parsed.vehicleType, 'bike');
  });

  it('rejects a phone number that is not a Pakistani mobile number', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, phone: '12345' });
    assert.equal(result.success, false);
  });

  it('accepts the international form of the phone number', () => {
    const result = riderRegisterSchema.safeParse({
      ...APP_PAYLOAD,
      phone: '+923001234567',
    });
    assert.equal(result.success, true);
  });

  it('rejects a CNIC in the wrong shape', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, cnic: '12345' });
    assert.equal(result.success, false);
  });

  it('rejects a password without a number', () => {
    const result = riderRegisterSchema.safeParse({
      ...APP_PAYLOAD,
      password: 'onlyletters',
    });
    assert.equal(result.success, false);
  });

  it('rejects a password that is too short', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, password: 'Ab1' });
    assert.equal(result.success, false);
  });

  it('rejects a missing vehicle registration number', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, vehiclePlate: '' });
    assert.equal(result.success, false);
  });

  it('rejects a vehicle registration number that is not plate-shaped', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, vehiclePlate: '!!' });
    assert.equal(result.success, false);
  });

  it('normalises a lowercase vehicle registration number', () => {
    const parsed = riderRegisterSchema.parse({ ...APP_PAYLOAD, vehiclePlate: 'swat-1234' });
    assert.equal(parsed.vehiclePlate, 'SWAT-1234');
  });

  it('rejects an unknown vehicle type', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, vehicleType: 'truck' });
    assert.equal(result.success, false);
  });

  it('rejects a missing map location', () => {
    const { latitude, longitude, ...withoutLocation } = APP_PAYLOAD;
    assert.equal(latitude, '34.8912');
    assert.equal(longitude, '72.5378');
    const result = riderRegisterSchema.safeParse(withoutLocation);
    assert.equal(result.success, false);
  });

  it('rejects a latitude outside the world', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, latitude: '120' });
    assert.equal(result.success, false);
  });

  it('rejects a fractional number of years', () => {
    const result = riderRegisterSchema.safeParse({ ...APP_PAYLOAD, experienceYears: '2.5' });
    assert.equal(result.success, false);
  });
});

describe('customer registration payload', () => {
  it('accepts what the sign-up screen sends', () => {
    const result = registerSchema.safeParse({
      name: 'Ahmad Khan',
      phone: '03001234567',
      email: 'ahmad.khan@example.com',
      password: 'SwatCity2026',
      role: 'customer',
    });
    assert.equal(result.success, true);
  });

  it('rejects an unknown role', () => {
    const result = registerSchema.safeParse({
      name: 'Ahmad Khan',
      phone: '03001234567',
      email: 'ahmad.khan@example.com',
      password: 'SwatCity2026',
      role: 'admin',
    });
    assert.equal(result.success, false);
  });
});

describe('email code verification payload', () => {
  it('accepts a six digit code', () => {
    const result = emailOtpVerifySchema.safeParse({
      challengeToken: 'a'.repeat(40),
      otp: '123456',
    });
    assert.equal(result.success, true);
  });

  it('rejects a code that is not six digits', () => {
    const result = emailOtpVerifySchema.safeParse({
      challengeToken: 'a'.repeat(40),
      otp: '12345',
    });
    assert.equal(result.success, false);
  });

  it('rejects a missing verification session', () => {
    const result = emailOtpVerifySchema.safeParse({ otp: '123456' });
    assert.equal(result.success, false);
  });
});
