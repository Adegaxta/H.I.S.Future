import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
try {
 const { buildNodeCreation } = await server.ssrLoadModule('/src/nodes/creation.ts');
 const { getPageMeta } = await server.ssrLoadModule('/src/utils/pageMeta.ts');
 const { readDefaultNodeType } = await server.ssrLoadModule('/src/workspace/defaultNodeType.ts');
 globalThis.localStorage = { getItem: () => 'tarea' };
 assert.equal(readDefaultNodeType('test'), 'tarea');
 const nodes = [{ id: 'parent', name: 'Parent', type: 'pagina', parentId: null, order: 0, content: '' }, { id: 'child', name: 'Child', type: 'pagina', parentId: 'parent', order: 0, content: '' }];
 const original = JSON.stringify(nodes);
 const draft = { name: ' New ', description: '', type: 'pagina', tagIds: [], parentId: null, childId: null, confirmedChildParentId: null, destination: 'lore' };
 assert.equal(getPageMeta(buildNodeCreation(nodes, 'new', draft).at(-1).content).description, '');
 assert.equal(buildNodeCreation(nodes, 'new', { ...draft, destination: 'vault' }).at(-1).loreHidden, true);
 assert.throws(() => buildNodeCreation(nodes, 'new', { ...draft, name: '  ' }));
 assert.throws(() => buildNodeCreation(nodes, 'new', { ...draft, parentId: 'missing' }));
 assert.throws(() => buildNodeCreation(nodes, 'new', { ...draft, childId: 'child' }));
 assert.throws(() => buildNodeCreation(nodes, 'new', { ...draft, childId: 'child', confirmedChildParentId: 'parent', parentId: 'child' }));
 assert.throws(() => buildNodeCreation(nodes, 'new', { ...draft, childId: 'parent', parentId: 'child' }));
 const moved = buildNodeCreation(nodes, 'new', { ...draft, childId: 'child', confirmedChildParentId: 'parent' });
 assert.equal(moved.find(n => n.id === 'child').parentId, 'new');
 assert.equal(moved.filter(n => n.id === 'child').length, 1);
 const childless = buildNodeCreation(nodes, 'new', { ...draft, childId: 'parent' });
 assert.equal(childless.find(n => n.id === 'parent').parentId, 'new');
 assert.equal(JSON.stringify(nodes), original);
 console.log('PASS: creation validation, defaults, empty description, single parent, cycles, immutable draft');
} finally { await server.close(); }
