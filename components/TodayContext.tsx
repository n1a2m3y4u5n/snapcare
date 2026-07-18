'use client';

import { useEffect, useState } from 'react';

function getWeatherEmoji(hour: number): string {
  if (hour >= 6 && hour < 12) return '🌤️';
  if (hour >= 12 && hour < 18) return '☀️';
  if (hour >= 18 && hour < 21) return '🌆';
  return '🌙';
}

function formatDate(date: Date, lang: string): string {
  return date.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

interface TodayContextProps {
  lang?: string;
}

/**
 * 날짜·날씨 픽토그램 헤더
 */
export function TodayContext({ lang = 'ko' }: TodayContextProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-12" />;

  const weather = getWeatherEmoji(now.getHours());
  const dateStr = formatDate(now, lang);

  return (
    <div className="flex items-center justify-center gap-3 py-2 text-neutral-700">
      <span className="text-3xl" role="img" aria-label="날씨">
        {weather}
      </span>
      <span className="text-base font-semibold">{dateStr}</span>
    </div>
  );
}
