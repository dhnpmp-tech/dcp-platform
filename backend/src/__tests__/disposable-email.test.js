'use strict';
const { isDisposableEmail, extractDomain } = require('../lib/disposable-email');

describe('isDisposableEmail', () => {
  test('blocks the exact domains seen in the 2026-08-17 mining abuse', () => {
    expect(isDisposableEmail('ltoqhlqkvduyjqglfr@onldm.net')).toBe(true);
    expect(isDisposableEmail('nnbeqkhkyrykcgdjty@vtmpj.com')).toBe(true);
    expect(isDisposableEmail('akrjtuhlscvqjafzlg@vtmpj.net')).toBe(true);
    expect(isDisposableEmail('x@lovadio.com')).toBe(true);
  });

  test('blocks the dynamic-DNS suffix family (*.dpdns.org)', () => {
    expect(isDisposableEmail('7yyvdj6y@raceco.dpdns.org')).toBe(true);
    expect(isDisposableEmail('anything@whatever.dpdns.org')).toBe(true);
  });

  test('blocks common public temp-mail providers', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@guerrillamail.com')).toBe(true);
    expect(isDisposableEmail('a@yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@10minutemail.com')).toBe(true);
  });

  test('allows legitimate email providers', () => {
    expect(isDisposableEmail('zaidrabee666@gmail.com')).toBe(false);
    expect(isDisposableEmail('customer@company.com.sa')).toBe(false);
    expect(isDisposableEmail('turki@dcp.sa')).toBe(false);
    expect(isDisposableEmail('a@outlook.com')).toBe(false);
    expect(isDisposableEmail('a@protonmail.com')).toBe(false);
  });

  test('case-insensitive on the domain', () => {
    expect(isDisposableEmail('X@ONLDM.NET')).toBe(true);
    expect(isDisposableEmail('X@Vtmpj.Com')).toBe(true);
  });

  test('does NOT block a legit domain that merely contains a blocked substring', () => {
    // "myonldm.net" is not "onldm.net" — exact-match only, no false positive.
    expect(isDisposableEmail('a@myonldm.net')).toBe(false);
    expect(isDisposableEmail('a@notdpdns.org.com')).toBe(false);
  });

  test('malformed / missing email → not blocked (never crashes)', () => {
    expect(isDisposableEmail('')).toBe(false);
    expect(isDisposableEmail(null)).toBe(false);
    expect(isDisposableEmail(undefined)).toBe(false);
    expect(isDisposableEmail('no-at-sign')).toBe(false);
  });

  test('extractDomain pulls the domain after the last @', () => {
    expect(extractDomain('user@Example.COM')).toBe('example.com');
    expect(extractDomain('weird@a@b.com')).toBe('b.com');
  });
});
