export const make = (ticket: string) => {
  const env = { GA_SESSION_TICKET: ticket };
  return env;
};
