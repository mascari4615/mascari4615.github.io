/**
 * 밤쪽에 켜지는 불빛 (TASK-KL-206)
 *
 * 왜 손으로 적나: 「밤이 된 곳에 사람이 산다」를 보이려는 것뿐이라 도시 이름표를 띄우지
 * 않는다. 그래서 필요한 건 *어디에 사람이 많은가* 뿐이고, 그건 큰 도시 몇십 개로 충분하다.
 * 도시 목록을 받아오는 요청을 하나 더 만드느니 여기 둔다 (좌표는 지구본 한 화면에서
 * 1px 도 안 되는 오차 범위다).
 *
 * `w` = 불빛의 세기(0~1). 인구 그 자체가 아니라 **밤에 얼마나 밝게 보이나**에 가깝게 뒀다.
 */
export interface City {
  name: string;
  lat: number;
  lon: number;
  w: number;
}

export const CITIES: City[] = [
  { name: 'Seoul', lat: 37.57, lon: 126.98, w: 1 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69, w: 1 },
  { name: 'Osaka', lat: 34.69, lon: 135.5, w: 0.8 },
  { name: 'Beijing', lat: 39.9, lon: 116.4, w: 0.95 },
  { name: 'Shanghai', lat: 31.23, lon: 121.47, w: 1 },
  { name: 'Hong Kong', lat: 22.32, lon: 114.17, w: 0.85 },
  { name: 'Taipei', lat: 25.03, lon: 121.57, w: 0.7 },
  { name: 'Manila', lat: 14.6, lon: 120.98, w: 0.8 },
  { name: 'Singapore', lat: 1.35, lon: 103.82, w: 0.8 },
  { name: 'Jakarta', lat: -6.21, lon: 106.85, w: 0.85 },
  { name: 'Bangkok', lat: 13.76, lon: 100.5, w: 0.8 },
  { name: 'Ho Chi Minh City', lat: 10.82, lon: 106.63, w: 0.7 },
  { name: 'Hanoi', lat: 21.03, lon: 105.85, w: 0.6 },
  { name: 'Kuala Lumpur', lat: 3.14, lon: 101.69, w: 0.6 },
  { name: 'Delhi', lat: 28.61, lon: 77.21, w: 0.9 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88, w: 0.85 },
  { name: 'Kolkata', lat: 22.57, lon: 88.36, w: 0.7 },
  { name: 'Chennai', lat: 13.08, lon: 80.27, w: 0.65 },
  { name: 'Bengaluru', lat: 12.97, lon: 77.59, w: 0.7 },
  { name: 'Dhaka', lat: 23.81, lon: 90.41, w: 0.7 },
  { name: 'Karachi', lat: 24.86, lon: 67.01, w: 0.7 },
  { name: 'Lahore', lat: 31.55, lon: 74.34, w: 0.6 },
  { name: 'Tehran', lat: 35.69, lon: 51.39, w: 0.7 },
  { name: 'Dubai', lat: 25.2, lon: 55.27, w: 0.75 },
  { name: 'Riyadh', lat: 24.71, lon: 46.68, w: 0.6 },
  { name: 'Baghdad', lat: 33.32, lon: 44.36, w: 0.55 },
  { name: 'Istanbul', lat: 41.01, lon: 28.98, w: 0.85 },
  { name: 'Cairo', lat: 30.04, lon: 31.24, w: 0.8 },
  { name: 'Lagos', lat: 6.52, lon: 3.38, w: 0.7 },
  { name: 'Kinshasa', lat: -4.44, lon: 15.27, w: 0.55 },
  { name: 'Nairobi', lat: -1.29, lon: 36.82, w: 0.5 },
  { name: 'Johannesburg', lat: -26.2, lon: 28.05, w: 0.6 },
  { name: 'Cape Town', lat: -33.92, lon: 18.42, w: 0.5 },
  { name: 'Casablanca', lat: 33.57, lon: -7.59, w: 0.5 },
  { name: 'Moscow', lat: 55.76, lon: 37.62, w: 0.85 },
  { name: 'Saint Petersburg', lat: 59.93, lon: 30.34, w: 0.6 },
  { name: 'Kyiv', lat: 50.45, lon: 30.52, w: 0.55 },
  { name: 'Warsaw', lat: 52.23, lon: 21.01, w: 0.55 },
  { name: 'Berlin', lat: 52.52, lon: 13.4, w: 0.7 },
  { name: 'Paris', lat: 48.86, lon: 2.35, w: 0.9 },
  { name: 'London', lat: 51.51, lon: -0.13, w: 0.95 },
  { name: 'Madrid', lat: 40.42, lon: -3.7, w: 0.7 },
  { name: 'Barcelona', lat: 41.39, lon: 2.17, w: 0.6 },
  { name: 'Rome', lat: 41.9, lon: 12.5, w: 0.65 },
  { name: 'Milan', lat: 45.46, lon: 9.19, w: 0.6 },
  { name: 'Amsterdam', lat: 52.37, lon: 4.9, w: 0.6 },
  { name: 'Stockholm', lat: 59.33, lon: 18.07, w: 0.5 },
  { name: 'Oslo', lat: 59.91, lon: 10.75, w: 0.45 },
  { name: 'Helsinki', lat: 60.17, lon: 24.94, w: 0.45 },
  { name: 'Reykjavik', lat: 64.15, lon: -21.94, w: 0.3 },
  { name: 'New York', lat: 40.71, lon: -74.01, w: 1 },
  { name: 'Chicago', lat: 41.88, lon: -87.63, w: 0.8 },
  { name: 'Toronto', lat: 43.65, lon: -79.38, w: 0.7 },
  { name: 'Montreal', lat: 45.5, lon: -73.57, w: 0.55 },
  { name: 'Vancouver', lat: 49.28, lon: -123.12, w: 0.5 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24, w: 0.95 },
  { name: 'San Francisco', lat: 37.77, lon: -122.42, w: 0.7 },
  { name: 'Seattle', lat: 47.61, lon: -122.33, w: 0.55 },
  { name: 'Denver', lat: 39.74, lon: -104.99, w: 0.5 },
  { name: 'Houston', lat: 29.76, lon: -95.37, w: 0.7 },
  { name: 'Miami', lat: 25.76, lon: -80.19, w: 0.65 },
  { name: 'Mexico City', lat: 19.43, lon: -99.13, w: 0.9 },
  { name: 'Bogota', lat: 4.71, lon: -74.07, w: 0.65 },
  { name: 'Lima', lat: -12.05, lon: -77.04, w: 0.65 },
  { name: 'Santiago', lat: -33.45, lon: -70.67, w: 0.6 },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.38, w: 0.8 },
  { name: 'Sao Paulo', lat: -23.55, lon: -46.63, w: 0.9 },
  { name: 'Rio de Janeiro', lat: -22.91, lon: -43.17, w: 0.75 },
  { name: 'Sydney', lat: -33.87, lon: 151.21, w: 0.7 },
  { name: 'Melbourne', lat: -37.81, lon: 144.96, w: 0.65 },
  { name: 'Perth', lat: -31.95, lon: 115.86, w: 0.45 },
  { name: 'Brisbane', lat: -27.47, lon: 153.03, w: 0.45 },
  { name: 'Auckland', lat: -36.85, lon: 174.76, w: 0.4 },
  { name: 'Honolulu', lat: 21.31, lon: -157.86, w: 0.3 },
  { name: 'Anchorage', lat: 61.22, lon: -149.9, w: 0.25 }
];
