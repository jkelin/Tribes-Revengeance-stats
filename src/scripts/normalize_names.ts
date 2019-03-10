require('dotenv').config();

import { Player } from '../db';
import * as Helpers from '../helpers';

async function main() {
  console.info('Normalizing names');

  const players = await Player.find().select({ _id: true });

  for (const player of players) {
    console.debug('Normalizing', player._id, 'into', Helpers.cleanPlayerName(player._id));
    player.normalizedName = Helpers.cleanPlayerName(player._id);
    await player.save();
  }
}

main()
  .then(() => {
    console.info('All done');
    process.exit(0);
  })
  .catch(ex => {
    console.error('Fatal in main');
    console.error(ex);
    process.exit(1);
  });
