import { describe, it, expect } from 'vitest'
import { createLaneWithBoundaries, createPedestrian, createSnapshot, createVehicle } from '../src/helpers.js'
import { exportToOpenScenario } from '../src/exporter/openscenario.js'

/**
 * The factories must produce shapes that the rest of the SDK actually consumes.
 *
 * `createPedestrian` used to emit `type: 'pedestrian'`, a shape type no consumer
 * recognises: the editor has only ever stored placed participants as `vehicle`,
 * and the OpenSCENARIO exporter selects `<Pedestrian>` vs `<Vehicle>` from
 * `templateId`. Scenes built with it silently lost every pedestrian — the
 * exporter emitted zero ScenarioObjects for them.
 *
 * Asserting the shape type alone is not enough (it would not have caught the
 * consequence), so these tests run the factory output through the exporter.
 */
describe('factory output is consumable by the exporters', () => {
  const lane = createLaneWithBoundaries(
    [{ x: 0, y: 0 }, { x: 500, y: 0 }],
    [{ x: 0, y: 50 }, { x: 500, y: 50 }],
  )

  it('createPedestrian produces a shape the OpenSCENARIO exporter emits', () => {
    const pedestrian = createPedestrian(300, 25)
    const xosc = exportToOpenScenario(createSnapshot([...lane, pedestrian]), {})

    expect(xosc).toContain('<Pedestrian ')
    expect(xosc).toContain('pedestrianCategory="pedestrian"')
    expect(xosc.match(/<ScenarioObject /g) ?? []).toHaveLength(1)
  })

  it('vehicles and pedestrians coexist and are told apart', () => {
    const xosc = exportToOpenScenario(
      createSnapshot([...lane, createVehicle(100, 25), createPedestrian(300, 25)]),
      {},
    )
    const names = [...xosc.matchAll(/<ScenarioObject name="([^"]+)"/g)].map((m) => m[1])

    expect(names).toEqual(['Vehicle_0', 'Pedestrian_1'])
    expect(xosc).toContain('<Vehicle ')
    expect(xosc).toContain('<Pedestrian ')
  })
})
