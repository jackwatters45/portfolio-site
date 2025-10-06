export interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  type: string;
  start_date: string;
  moving_time: number;
  elapsed_time: number;
  average_heartrate: number | null;
  average_speed: number;
}

export interface StravaActivityWithIndex extends StravaActivity {
  index: number;
}
