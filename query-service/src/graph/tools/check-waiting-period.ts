export function checkWaitingPeriod(enrollmentDate: string, incidentDate: string, waitingDays: number): boolean {
  const enrollment = new Date(enrollmentDate);
  const incident = new Date(incidentDate);
  const diffDays = Math.floor((incident.getTime() - enrollment.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= waitingDays;
}
