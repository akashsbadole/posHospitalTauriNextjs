import { differenceInYears, isAfter, parseISO } from 'date-fns';

export function calculateAge(dob: string): number {
  const birth = parseISO(dob);
  const now = new Date();
  let age = differenceInYears(now, birth);
  // Adjust if birthday hasn't occurred yet this year
  const thisYearsBirthday = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (isAfter(thisYearsBirthday, now)) age--;
  return age;
}

export function formatDate(date: string): string {
  return parseISO(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
