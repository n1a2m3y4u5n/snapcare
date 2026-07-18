import bcrypt from 'bcryptjs';
import { supabase } from './supabase';

// 픽토그램 PIN 풀 (12개)
export const PICTO_PIN_POOL = [
  'apple', 'banana', 'dog', 'cat', 'sun', 'moon',
  'star', 'flower', 'house', 'car', 'water', 'fire',
] as const;

export type PictoPinItem = typeof PICTO_PIN_POOL[number];

// 이모지 매핑
export const PICTO_EMOJI: Record<PictoPinItem, string> = {
  apple: '🍎',
  banana: '🍌',
  dog: '🐶',
  cat: '🐱',
  sun: '☀️',
  moon: '🌙',
  star: '⭐',
  flower: '🌸',
  house: '🏠',
  car: '🚗',
  water: '💧',
  fire: '🔥',
};

/** 픽토그램 PIN 배열을 bcrypt 해시로 변환한다 */
export async function hashPictoPin(pin: PictoPinItem[]): Promise<string> {
  const pinString = pin.join(',');
  return bcrypt.hash(pinString, 10);
}

/** 픽토그램 PIN이 해시와 일치하는지 검증한다 */
export async function verifyPictoPin(pin: PictoPinItem[], hash: string): Promise<boolean> {
  const pinString = pin.join(',');
  return bcrypt.compare(pinString, hash);
}

/** Supabase로 OTP 전송 (SMS) */
export async function sendOtp(phone: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return { error: error?.message ?? null };
}

/** OTP 검증 */
export async function verifyOtp(
  phone: string,
  token: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });
  return { error: error?.message ?? null };
}
