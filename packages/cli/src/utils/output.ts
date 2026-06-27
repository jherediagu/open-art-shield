// Everything user-facing goes through here so tests can capture it and the
// formatting stays in one place.

export const CLI_VERSION = "0.1.0";

/* eslint-disable no-console */

export function info(message: string): void {
  console.log(message);
}

export function success(message: string): void {
  console.log(`✓ ${message}`);
}

export function failure(message: string): void {
  console.error(`✗ ${message}`);
}

// Undecorated - used for JSON so output stays pipeable.
export function raw(text: string): void {
  console.log(text);
}

/* eslint-enable no-console */
