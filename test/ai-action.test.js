const test = require('node:test');
const assert = require('node:assert');
const AI = require('../ai');

test('triage suggests register_vehicle for vehicle requests, assign_vendor for maintenance', () => {
  const vendors = [{ id: 1, trade: 'electrical' }, { id: 2, trade: 'plumbing' }];
  assert.equal(AI.triageRules('I want to register my car', vendors).action, 'register_vehicle');
  assert.equal(AI.triageRules('I want to park my scooter please', vendors).action, 'register_vehicle');
  assert.equal(AI.triageRules('The light and the fan are not working', vendors).action, 'assign_vendor');
  assert.equal(AI.triageRules('The tap is leaking', vendors).action, 'assign_vendor');
  assert.equal(AI.triageRules('Just saying hello everyone', vendors).action, null);
});

test('parseVehicle extracts plate, type and make from free text', () => {
  const pv = AI.parseVehicle('Please register my Honda City, number MH12 AB 1234');
  assert.equal(pv.plate, 'MH12 AB 1234');
  assert.equal(pv.type, 'car');
  assert.equal(pv.make, 'Honda');
  assert.equal(AI.parseVehicle('add my new scooter to parking').type, 'bike');
  assert.equal(AI.parseVehicle('register a vehicle').plate, null);
});
