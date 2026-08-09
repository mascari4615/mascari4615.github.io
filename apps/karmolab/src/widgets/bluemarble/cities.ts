/**
 * 자리에 이름 붙이기 (TASK-KL-206)
 *
 * 왜 손으로 적나: 「거기가 어디쯤인가」를 말하려는 것뿐이라 큰 도시 몇십 개면 된다.
 * 도시 목록을 받아오는 요청을 하나 더 만드느니 여기 둔다 (좌표 오차는 지구본 한 화면에서
 * 1px 도 안 된다).
 *
 * 불빛 자체는 이제 이 목록으로 안 그린다 — 진짜 야간 조도 그림(`data/earth/night.webp`)이
 * 그 일을 한다. 여기 남은 쓸모는 **이름 붙이기** 하나다: 「북위 35.6° 동경 139.7°」 대신
 * 「도쿄 하늘 위」라고 말하기 위한 것.
 */
export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { name: 'Seoul', lat: 37.57, lon: 126.98 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Osaka', lat: 34.69, lon: 135.5 },
  { name: 'Beijing', lat: 39.9, lon: 116.4 },
  { name: 'Shanghai', lat: 31.23, lon: 121.47 },
  { name: 'Hong Kong', lat: 22.32, lon: 114.17 },
  { name: 'Taipei', lat: 25.03, lon: 121.57 },
  { name: 'Manila', lat: 14.6, lon: 120.98 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Jakarta', lat: -6.21, lon: 106.85 },
  { name: 'Bangkok', lat: 13.76, lon: 100.5 },
  { name: 'Ho Chi Minh City', lat: 10.82, lon: 106.63 },
  { name: 'Hanoi', lat: 21.03, lon: 105.85 },
  { name: 'Kuala Lumpur', lat: 3.14, lon: 101.69 },
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Kolkata', lat: 22.57, lon: 88.36 },
  { name: 'Chennai', lat: 13.08, lon: 80.27 },
  { name: 'Bengaluru', lat: 12.97, lon: 77.59 },
  { name: 'Dhaka', lat: 23.81, lon: 90.41 },
  { name: 'Karachi', lat: 24.86, lon: 67.01 },
  { name: 'Lahore', lat: 31.55, lon: 74.34 },
  { name: 'Tehran', lat: 35.69, lon: 51.39 },
  { name: 'Dubai', lat: 25.2, lon: 55.27 },
  { name: 'Riyadh', lat: 24.71, lon: 46.68 },
  { name: 'Baghdad', lat: 33.32, lon: 44.36 },
  { name: 'Istanbul', lat: 41.01, lon: 28.98 },
  { name: 'Cairo', lat: 30.04, lon: 31.24 },
  { name: 'Lagos', lat: 6.52, lon: 3.38 },
  { name: 'Kinshasa', lat: -4.44, lon: 15.27 },
  { name: 'Nairobi', lat: -1.29, lon: 36.82 },
  { name: 'Johannesburg', lat: -26.2, lon: 28.05 },
  { name: 'Cape Town', lat: -33.92, lon: 18.42 },
  { name: 'Casablanca', lat: 33.57, lon: -7.59 },
  { name: 'Moscow', lat: 55.76, lon: 37.62 },
  { name: 'Saint Petersburg', lat: 59.93, lon: 30.34 },
  { name: 'Kyiv', lat: 50.45, lon: 30.52 },
  { name: 'Warsaw', lat: 52.23, lon: 21.01 },
  { name: 'Berlin', lat: 52.52, lon: 13.4 },
  { name: 'Paris', lat: 48.86, lon: 2.35 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Madrid', lat: 40.42, lon: -3.7 },
  { name: 'Barcelona', lat: 41.39, lon: 2.17 },
  { name: 'Rome', lat: 41.9, lon: 12.5 },
  { name: 'Milan', lat: 45.46, lon: 9.19 },
  { name: 'Amsterdam', lat: 52.37, lon: 4.9 },
  { name: 'Stockholm', lat: 59.33, lon: 18.07 },
  { name: 'Oslo', lat: 59.91, lon: 10.75 },
  { name: 'Helsinki', lat: 60.17, lon: 24.94 },
  { name: 'Reykjavik', lat: 64.15, lon: -21.94 },
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'Chicago', lat: 41.88, lon: -87.63 },
  { name: 'Toronto', lat: 43.65, lon: -79.38 },
  { name: 'Montreal', lat: 45.5, lon: -73.57 },
  { name: 'Vancouver', lat: 49.28, lon: -123.12 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'San Francisco', lat: 37.77, lon: -122.42 },
  { name: 'Seattle', lat: 47.61, lon: -122.33 },
  { name: 'Denver', lat: 39.74, lon: -104.99 },
  { name: 'Houston', lat: 29.76, lon: -95.37 },
  { name: 'Miami', lat: 25.76, lon: -80.19 },
  { name: 'Mexico City', lat: 19.43, lon: -99.13 },
  { name: 'Bogota', lat: 4.71, lon: -74.07 },
  { name: 'Lima', lat: -12.05, lon: -77.04 },
  { name: 'Santiago', lat: -33.45, lon: -70.67 },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.38 },
  { name: 'Sao Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Rio de Janeiro', lat: -22.91, lon: -43.17 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Melbourne', lat: -37.81, lon: 144.96 },
  { name: 'Perth', lat: -31.95, lon: 115.86 },
  { name: 'Brisbane', lat: -27.47, lon: 153.03 },
  { name: 'Auckland', lat: -36.85, lon: 174.76 },
  { name: 'Honolulu', lat: 21.31, lon: -157.86 },
  { name: 'Anchorage', lat: 61.22, lon: -149.9 }
];
