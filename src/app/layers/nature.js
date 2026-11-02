import {
  createNatureLayer,
  createCoralStationSource,
} from '../../layers/nature/index.js';
import { governorRequestRender } from '../../renderGovernor.js';

/** Wire the Nature timeline to the local Coral Reef Watch proxy. */
export function createApplicationNature() {
  return createNatureLayer({
    coralSource: createCoralStationSource(),
    requestRender: governorRequestRender,
  });
}
