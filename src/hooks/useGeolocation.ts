import { useState, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { isNativeApp } from '@/lib/platform';

interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export type GeolocationMode = 'accurate' | 'approximate';

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPosition = useCallback((mode: GeolocationMode = 'accurate'): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      setLoading(true);
      setError(null);

      const success = (coords: GeoPosition) => {
        setPosition(coords);
        setLoading(false);
        resolve(coords);
      };

      const fail = (message: string) => {
        setError(message);
        setLoading(false);
        reject(new Error(message));
      };

      if (isNativeApp()) {
        Geolocation.requestPermissions()
          .then(() =>
            Geolocation.getCurrentPosition({
              enableHighAccuracy: mode === 'accurate',
              timeout: mode === 'accurate' ? 15000 : 7000,
              maximumAge: mode === 'accurate' ? 15000 : 300000,
            }),
          )
          .then((pos) => {
            success({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
          })
          .catch((err: any) => {
            const message = typeof err?.message === 'string' ? err.message : 'Location unavailable';
            if (/denied/i.test(message)) {
              fail('Location permission denied');
              return;
            }

            if (/timeout/i.test(message)) {
              fail('Location request timed out');
              return;
            }

            fail(message);
          });
        return;
      }

      if (!navigator.geolocation) {
        fail('Geolocation not supported');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          success({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
        },
        (err) => {
          let msg = 'Location unavailable';
          if (err.code === 1) msg = 'Location permission denied';
          if (err.code === 3) msg = 'Location request timed out';
          fail(msg);
        },
        {
          enableHighAccuracy: mode === 'accurate',
          timeout: mode === 'accurate' ? 15000 : 7000,
          maximumAge: mode === 'accurate' ? 15000 : 300000,
        }
      );
    });
  }, []);

  // Confidence score based on accuracy (meters)
  const confidenceFromAccuracy = (accuracy: number): number => {
    if (accuracy <= 10) return 0.98;
    if (accuracy <= 30) return 0.92;
    if (accuracy <= 100) return 0.85;
    if (accuracy <= 500) return 0.7;
    return 0.5;
  };

  return { position, loading, error, requestPosition, confidenceFromAccuracy };
}
