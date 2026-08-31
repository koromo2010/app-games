type GameOperationsLoadOptions = {
  fresh?: boolean;
};

export type GameLobbyCriticalPageDataSources<TOperation, TDurationEstimates> = {
  loadSiteSettings: () => Promise<{ siteName: string }>;
  loadGameOperations: (
    options: GameOperationsLoadOptions,
    additionalGames: never[],
  ) => Promise<TOperation[]>;
  loadGameDurationEstimates: () => Promise<TDurationEstimates>;
};

/**
 * Builds the critical, serializable props shared by every public Game Fields
 * catalog route. The remote SDK catalog is deliberately not a dependency of
 * this read model: it is revalidated after the built-in lobby has rendered.
 */
export async function assembleGameLobbyCriticalPageData<
  TOperation,
  TDurationEstimates,
>(
  sources: GameLobbyCriticalPageDataSources<TOperation, TDurationEstimates>,
) {
  const settingsPromise = sources.loadSiteSettings();
  const durationEstimatesPromise = sources.loadGameDurationEstimates();
  const gameOperationsPromise = sources.loadGameOperations({}, []);

  const [settings, gameOperations, durationEstimates] = await Promise.all([
    settingsPromise,
    gameOperationsPromise,
    durationEstimatesPromise,
  ]);

  return {
    siteName: settings.siteName,
    gameOperations,
    durationEstimates,
    deferredCatalogEndpoint: "/api/public/game-catalog",
  };
}

export type DeferredGameLobbyCatalogSources<TGame, TOperation> = {
  loadApprovedGameSdkCatalogSnapshot: () => Promise<{
    games: TGame[];
    sourceVersion: string;
  }>;
  loadGameOperations: (
    options: GameOperationsLoadOptions,
    additionalGames: TGame[],
  ) => Promise<TOperation[]>;
};

/**
 * Loads a fresh SDK catalog outside the root HTML critical path. Operations
 * are read fresh against the same complete game set so a revalidated response
 * cannot pair a new catalog with stale visibility controls.
 */
export async function assembleDeferredGameLobbyCatalog<TGame, TOperation>(
  sources: DeferredGameLobbyCatalogSources<TGame, TOperation>,
) {
  const snapshot = await sources.loadApprovedGameSdkCatalogSnapshot();
  const gameOperations = await sources.loadGameOperations(
    { fresh: true },
    snapshot.games,
  );
  return {
    sourceVersion: snapshot.sourceVersion,
    additionalGames: snapshot.games,
    gameOperations,
  };
}
