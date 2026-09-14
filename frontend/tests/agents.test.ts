import { describe, expect, it } from 'vitest'
import { buildAgentSpec, DEFAULT_SETUP } from '@/store/game-store'

describe('advanced AI payloads', () => {
  it('passes ISMCTS simulations to the backend', () => {
    expect(buildAgentSpec({ ...DEFAULT_SETUP, agentTypes: ['human', 'ismcts'], ismctsSimulations: 1000 }, 1)).toEqual({ type: 'ismcts', simulations: 1000 })
  })

  it('passes an MCCFR registry id instead of a browser-local path', () => {
    expect(buildAgentSpec({ ...DEFAULT_SETUP, agentTypes: ['human', 'mccfr'], mccfrModel: 'mccfr_3p_10k' }, 1)).toEqual({ type: 'mccfr', id: 'mccfr_3p_10k' })
  })
})
