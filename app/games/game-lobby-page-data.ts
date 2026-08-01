type GameOperationsLoadOptions = {
  fresh?: boolean;
};

export type GameLobbyPageDataSources<TGame, TOperation, TDurationEstimates> = {
  loadApprovedGameSdkCatalog: () => Promise<TGame[]>;
  loadSiteSettings: () => Promise<{ siteName: string }>;
  loadGameOperations: (
    options: GameOperationsLoadOptions,
    additionalGames: TGame[],
  ) => Promise<TOperation[]>;
  loadGameDurationEstimates: () => Promise<TDurationEstimates>;
};

/**
 * Builds the serializable props shared by every public Game Fields catalog
 * route. SDK catalog failure stays isolated, while the other independent reads
 * start in parallel and preserve the source catalog order.
 */
export async function assembleGameLobbyPageData<
  TGame,
  TOperation,
  TDurationEstimates,
>(
  sources: GameLobbyPageDataSources<TGame, TOperation, TDurationEstimates>,
) {
  const sdkGamesPromise = sources.loadApprovedGameSdkCatalog().catch(() => [] as TGame[]);
  const settingsPromise = sources.loadSiteSettings();
  const durationEstimatesPromise = sources.loadGameDurationEstimates();
  const gameOperationsPromise = sdkGamesPromise.then((sdkGames) => (
    sources.loadGameOperations({}, sdkGames)
  ));

  const [sdkGames, settings, gameOperations, durationEstimates] = await Promise.all([
    sdkGamesPromise,
    settingsPromise,
    gameOperationsPromise,
    durationEstimatesPromise,
  ]);

  return {
    siteName: settings.siteName,
    gameOperations,
    durationEstimates,
    additionalGames: sdkGames,
  };
}
