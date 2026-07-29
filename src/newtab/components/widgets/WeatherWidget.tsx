import { useEffect, useState } from 'preact/hooks';
import { Sun, Cloud, CloudSun, CloudRain } from 'lucide-preact';
import { t } from '@shared/i18n';

interface WeatherWidgetViewProps {
  city?: string;
}

interface WeatherData {
  temp: number;
  condition: 'Sunny' | 'Cloudy' | 'Partly Cloudy' | 'Rainy' | 'Stormy' | 'Snowy';
  cityName: string;
  isGeo: boolean;
}

const weatherCache = new Map<string, { data: WeatherData; expiry: number }>();
const WEATHER_CACHE_TTL = 300_000;

function getCacheKey(city: string): string {
  return city || '__geo';
}

export function WeatherWidgetView({ city = '' }: WeatherWidgetViewProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cacheKey = getCacheKey(city);
    const cached = weatherCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      setWeather(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    const abort = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        let lat: number;
        let lon: number;
        let cityName: string;
        let isGeo = false;

        if (city) {
          const geo = await geocodeCity(city, abort.signal);
          if (!geo) throw new Error(t('weather.cityNotFound'));
          lat = geo.lat;
          lon = geo.lon;
          cityName = geo.name;
        }
        else if (navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 8000,
                maximumAge: 600000
              });
            });
            lat = pos.coords.latitude;
            lon = pos.coords.longitude;
            isGeo = true;
            cityName = await reverseGeocode(lat, lon, abort.signal);
          } catch {
            throw new Error(t('weather.locationUnavailable'));
          }
        } else {
          throw new Error(t('weather.locationUnavailable'));
        }

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`,
          { signal: abort.signal }
        );
        if (!response.ok) throw new Error(t('weather.fetchFailed'));
        const data = await response.json();
        const code = data.current_weather?.weathercode ?? 0;
        const temp = data.current_weather?.temperature;

        if (!cancelled) {
          const w: WeatherData = {
            temp: Math.round(temp ?? 0),
            condition: weatherCodeToCondition(code),
            cityName,
            isGeo
          };
          weatherCache.set(cacheKey, { data: w, expiry: Date.now() + WEATHER_CACHE_TTL });
          setWeather(w);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cancelled) setError(err instanceof Error ? err.message : t('weather.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; abort.abort(); };
  }, [city]);

  if (loading) {
    return (
      <div className="weather-widget">
        <div className="weather-widget__city">—</div>
        <div className="weather-widget__row">
          <span className="weather-widget__temp">—</span>
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="weather-widget">
        <div className="weather-widget__city">—</div>
        <div className="weather-widget__row">
          <span className="weather-widget__temp">—</span>
        </div>
      </div>
    );
  }

  const iconName: 'sun' | 'cloud' | 'cloud-sun' | 'cloud-rain' =
    weather.condition === 'Sunny'
      ? 'sun'
      : weather.condition === 'Cloudy'
      ? 'cloud'
      : weather.condition === 'Rainy' || weather.condition === 'Stormy'
      ? 'cloud-rain'
      : 'cloud-sun';

  return (
    <div className="weather-widget">
      <div className="weather-widget__city">
        {weather.isGeo ? '📍 ' : ''}{weather.cityName.toUpperCase()}
      </div>
      <div className="weather-widget__row">
        {iconName === 'sun' ? <Sun size={22} strokeWidth={2} />
          : iconName === 'cloud' ? <Cloud size={22} strokeWidth={2} />
          : iconName === 'cloud-rain' ? <CloudRain size={22} strokeWidth={2} />
          : <CloudSun size={22} strokeWidth={2} />}
        <span className="weather-widget__temp">{weather.temp}°C</span>
      </div>
    </div>
  );
}

async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`,
      { signal }
    );
    if (!response.ok) return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    const data = await response.json();
    return data.city || data.locality || data.principalSubdivision || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

async function geocodeCity(city: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`,
      { signal }
    );
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.results?.[0];
    if (!result) return null;
    return { lat: result.latitude, lon: result.longitude, name: result.name || result.country || city };
  } catch {
    return null;
  }
}

function weatherCodeToCondition(code: number): WeatherData['condition'] {
  if (code === 0) return 'Sunny';
  if (code >= 1 && code <= 3) return 'Partly Cloudy';
  if (code >= 45 && code <= 48) return 'Cloudy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'Rainy';
  if (code >= 71 && code <= 77) return 'Snowy';
  if (code >= 95) return 'Stormy';
  return 'Partly Cloudy';
}
