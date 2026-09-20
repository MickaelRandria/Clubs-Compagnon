import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { ARCHETYPES, archetypeImage, PLAYSTYLE_FAMILIES, UI_IMAGES } from '../shared/data/archetypes.js';

// Chaque visuel référencé par shared/data/archetypes.ts doit exister dans public/ et rester léger.
const publicFile = (path: string) => new URL(`../public${path}`, import.meta.url);
const MAX_BYTES = 300 * 1024;

function assertAsset(path: string) {
  const file = publicFile(path);
  assert.ok(existsSync(file), `Image manquante : public${path}`);
  assert.ok(statSync(file).size <= MAX_BYTES, `Image trop lourde (> 300 Ko) : public${path}`);
}

test('every archetype has a portrait', () => {
  for (const archetype of ARCHETYPES) assertAsset(archetypeImage(archetype.id));
});

test('every PlayStyle family has a badge, and every signature uses a known family', () => {
  for (const family of Object.values(PLAYSTYLE_FAMILIES)) assertAsset(family.badge);
  for (const archetype of ARCHETYPES) assert.ok(archetype.signature.family in PLAYSTYLE_FAMILIES, archetype.id);
});

test('interface textures exist', () => {
  for (const path of Object.values(UI_IMAGES)) assertAsset(path);
});
