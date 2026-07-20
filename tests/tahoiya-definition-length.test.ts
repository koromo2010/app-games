import assert from "node:assert/strict";
import test from "node:test";
import {
  pickTahoiyaDefinitionStyle,
  tahoiyaDefinitionMedianLength,
  tahoiyaDefinitionMedianLengthChoices,
  tahoiyaDefinitionStyleRules,
  tahoiyaDefinitionStyleWeightsByMedian,
} from "../lib/tahoiya-definition-length.ts";
import { installRuntimeHyperparameterOverrides } from "../lib/runtime-hyperparameters-core.ts";

test("各ハイパラの重みは合計100%で指定した文字帯が中央値になる", () => {
  const medianStyleIndexes = [0, 1, 2, 3, 4];
  for (const [index, medianLength] of tahoiyaDefinitionMedianLengthChoices.entries()) {
    const weights = tahoiyaDefinitionStyleWeightsByMedian[medianLength];
    const medianStyleIndex = medianStyleIndexes[index];
    const weightBeforeMedian = weights
      .slice(0, medianStyleIndex)
      .reduce((sum, choice) => sum + choice.weight, 0);
    const weightThroughMedian = weights
      .slice(0, medianStyleIndex + 1)
      .reduce((sum, choice) => sum + choice.weight, 0);

    assert.equal(weights.reduce((sum, choice) => sum + choice.weight, 0), 100);
    assert.ok(weightBeforeMedian < 50);
    assert.ok(weightThroughMedian >= 50);
    assert.equal(pickTahoiyaDefinitionStyle(() => 0.5, medianLength), weights[medianStyleIndex]?.style);
  }
});

test("各文字帯は上限だけでなく自然な目標範囲を持つ", () => {
  assert.deepEqual(
    Object.values(tahoiyaDefinitionStyleRules).map(({ min, max }) => [min, max]),
    [[6, 14], [14, 25], [24, 38], [32, 46], [40, 55], [48, 60]],
  );
  for (const rule of Object.values(tahoiyaDefinitionStyleRules)) {
    assert.ok(rule.min < rule.max);
    assert.match(rule.contentInstruction, /含める|つなぐ/);
  }
});

test("正解文の長さを設定した確率境界で選ぶ", () => {
  const cases: Array<[number, string]> = [
    [0, "brief"],
    [0.149, "brief"],
    [0.15, "standard"],
    [0.399, "standard"],
    [0.4, "detailed"],
    [0.699, "detailed"],
    [0.7, "long"],
    [0.869, "long"],
    [0.87, "extended"],
    [0.959, "extended"],
    [0.96, "maximum"],
    [0.999, "maximum"],
  ];

  for (const [random, expected] of cases) {
    assert.equal(pickTahoiyaDefinitionStyle(() => random, 30), expected, `${random} should be ${expected}`);
  }
});

test("管理ハイパラの中央値を新しい正解文の生成分布へ反映する", () => {
  try {
    installRuntimeHyperparameterOverrides({ "tahoiya-definition-median": 40 });
    assert.equal(tahoiyaDefinitionMedianLength(), 40);
    assert.equal(pickTahoiyaDefinitionStyle(() => 0.5), "long");
  } finally {
    installRuntimeHyperparameterOverrides({});
  }
  assert.equal(tahoiyaDefinitionMedianLength(), 30);
});
