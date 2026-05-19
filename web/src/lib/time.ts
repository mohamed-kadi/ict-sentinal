export type ClockOption = {
  id: string;
  label: string;
};

export const CLOCK_OPTIONS: ClockOption[] = [
  { id: 'America/New_York', label: 'New York' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Paris', label: 'Europe/Paris' },
];

export function formatWithTz(dateInput: Date | number, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  const date = typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  const baseOptions: Intl.DateTimeFormatOptions =
    options ?? {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    };
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    ...baseOptions,
  }).format(date);
}

export function getClockLabel(clockTz: string) {
  return CLOCK_OPTIONS.find((opt) => opt.id === clockTz)?.label ?? clockTz;
}
