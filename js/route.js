function toRad(value) {
  return (value * Math.PI) / 180;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function routeDistanceFromOrder(startPoint, orderedPoints, endPoint = null) {
  if (!startPoint) {
    return 0;
  }

  let totalDistance = 0;
  let current = startPoint;

  for (const point of orderedPoints) {
    totalDistance += haversineDistance(
      current.lat,
      current.lng,
      point.lat,
      point.lng
    );
    current = point;
  }

  if (endPoint) {
    totalDistance += haversineDistance(
      current.lat,
      current.lng,
      endPoint.lat,
      endPoint.lng
    );
  }

  return totalDistance;
}

function attachStepDistances(startPoint, orderedPoints) {
  if (!startPoint || !orderedPoints.length) {
    return [];
  }

  let current = startPoint;

  return orderedPoints.map((point) => {
    const distanceFromPrevious = haversineDistance(
      current.lat,
      current.lng,
      point.lat,
      point.lng
    );

    current = point;

    return {
      ...point,
      distanceFromPrevious
    };
  });
}

function attachEndPointDistance(startPoint, orderedPoints, endPoint) {
  if (!startPoint || !endPoint) return null;

  const previous = orderedPoints.length
    ? orderedPoints[orderedPoints.length - 1]
    : startPoint;

  return {
    ...endPoint,
    distanceFromPrevious: haversineDistance(
      previous.lat,
      previous.lng,
      endPoint.lat,
      endPoint.lng
    )
  };
}

function nearestNeighborOrderFromSeed(startPoint, points, seedIndex = -1) {
  const remaining = [...points];
  const ordered = [];
  let current = { ...startPoint };

  if (seedIndex >= 0 && seedIndex < remaining.length) {
    const firstPoint = remaining.splice(seedIndex, 1)[0];
    ordered.push(firstPoint);
    current = firstPoint;
  }

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const distance = haversineDistance(
        current.lat,
        current.lng,
        candidate.lat,
        candidate.lng
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const nextPoint = remaining.splice(nearestIndex, 1)[0];
    ordered.push(nextPoint);
    current = nextPoint;
  }

  return ordered;
}

function reverseSegment(order, startIndex, endIndex) {
  while (startIndex < endIndex) {
    const temp = order[startIndex];
    order[startIndex] = order[endIndex];
    order[endIndex] = temp;
    startIndex += 1;
    endIndex -= 1;
  }
}

function improveWithTwoOpt(startPoint, initialOrder, timeLimitMs, endPoint = null) {
  const order = [...initialOrder];

  if (order.length < 4) {
    return order;
  }

  let bestDistance = routeDistanceFromOrder(startPoint, order, endPoint);
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? () => performance.now()
      : () => Date.now();

  const deadline = now() + timeLimitMs;
  let improved = true;

  while (improved && now() < deadline) {
    improved = false;

    for (let i = 0; i < order.length - 1; i += 1) {
      if (now() >= deadline) {
        break;
      }

      for (let k = i + 1; k < order.length; k += 1) {
        if (now() >= deadline) {
          break;
        }

        const candidate = [...order];
        reverseSegment(candidate, i, k);

        const candidateDistance = routeDistanceFromOrder(
          startPoint,
          candidate,
          endPoint
        );

        if (candidateDistance + 1e-9 < bestDistance) {
          order.splice(0, order.length, ...candidate);
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return order;
}

function buildSeedIndexes(startPoint, points, endPoint = null) {
  if (!points.length) {
    return [];
  }

  const indexes = new Set();

  indexes.add(0);

  let nearestToStart = 0;
  let nearestDistance = Infinity;
  let farthestFromStart = 0;
  let farthestDistance = -Infinity;
  let northIndex = 0;
  let southIndex = 0;
  let eastIndex = 0;
  let westIndex = 0;

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];

    const distanceFromStart = haversineDistance(
      startPoint.lat,
      startPoint.lng,
      point.lat,
      point.lng
    );

    if (distanceFromStart < nearestDistance) {
      nearestDistance = distanceFromStart;
      nearestToStart = i;
    }

    if (distanceFromStart > farthestDistance) {
      farthestDistance = distanceFromStart;
      farthestFromStart = i;
    }

    if (point.lat > points[northIndex].lat) northIndex = i;
    if (point.lat < points[southIndex].lat) southIndex = i;
    if (point.lng > points[eastIndex].lng) eastIndex = i;
    if (point.lng < points[westIndex].lng) westIndex = i;
  }

  [
    nearestToStart,
    farthestFromStart,
    northIndex,
    southIndex,
    eastIndex,
    westIndex
  ].forEach((index) => indexes.add(index));

  if (endPoint) {
    let nearestToEnd = 0;
    let nearestEndDistance = Infinity;

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];

      const distanceToEnd = haversineDistance(
        point.lat,
        point.lng,
        endPoint.lat,
        endPoint.lng
      );

      if (distanceToEnd < nearestEndDistance) {
        nearestEndDistance = distanceToEnd;
        nearestToEnd = i;
      }
    }

    indexes.add(nearestToEnd);
  }

  return [...indexes];
}

function nearestNeighborRoute(startPoint, points, endPoint = null) {
  if (!startPoint) {
    return {
      orderedPoints: [],
      endPoint: endPoint || null,
      totalDistance: 0
    };
  }

  if (!points.length) {
    const endPointWithDistance = attachEndPointDistance(startPoint, [], endPoint);

    return {
      orderedPoints: [],
      endPoint: endPointWithDistance,
      totalDistance: endPointWithDistance?.distanceFromPrevious || 0
    };
  }

  if (points.length === 1) {
    const orderedPoints = attachStepDistances(startPoint, points);

    const endPointWithDistance = attachEndPointDistance(
      startPoint,
      orderedPoints,
      endPoint
    );

    return {
      orderedPoints,
      endPoint: endPointWithDistance,
      totalDistance: routeDistanceFromOrder(startPoint, orderedPoints, endPoint)
    };
  }

  const totalBudgetMs =
    points.length <= 60 ? 140 : points.length <= 120 ? 220 : 320;

  const seedIndexes = buildSeedIndexes(startPoint, points, endPoint);

  const perSeedBudget = Math.max(
    20,
    Math.floor(totalBudgetMs / Math.max(seedIndexes.length, 1))
  );

  let bestOrder = nearestNeighborOrderFromSeed(startPoint, points, -1);
  let bestDistance = routeDistanceFromOrder(startPoint, bestOrder, endPoint);

  for (const seedIndex of seedIndexes) {
    let candidateOrder = nearestNeighborOrderFromSeed(
      startPoint,
      points,
      seedIndex
    );

    candidateOrder = improveWithTwoOpt(
      startPoint,
      candidateOrder,
      perSeedBudget,
      endPoint
    );

    const candidateDistance = routeDistanceFromOrder(
      startPoint,
      candidateOrder,
      endPoint
    );

    if (candidateDistance + 1e-9 < bestDistance) {
      bestOrder = candidateOrder;
      bestDistance = candidateDistance;
    }
  }

  const orderedPoints = attachStepDistances(startPoint, bestOrder);

  const endPointWithDistance = attachEndPointDistance(
    startPoint,
    orderedPoints,
    endPoint
  );

  return {
    orderedPoints,
    endPoint: endPointWithDistance,
    totalDistance: bestDistance
  };
}

export { haversineDistance, nearestNeighborRoute };
