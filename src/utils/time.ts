export function formatTime(d: Date) {
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return {
    time: `${displayHours}:${minutes.toString().padStart(2, "0")}`,
    period
  };
}

export function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60 * 1000);
}

export function formatTimeLabel(d: Date) {
  const { time, period } = formatTime(d);
  return `${time} ${period}`;
}

export function formatTimeRange(start: Date, end: Date) {
  return `${formatTimeLabel(start)} - ${formatTimeLabel(end)}`;
}

