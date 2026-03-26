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

function nearestNeighborRoute(startPoint, points) {
  if (!startPoint || !points.length) {
    return {
      orderedPoints: [],
      totalDistance: 0
    };
  }

  const remaining = [...points];
  const ordered = [];
  let totalDistance = 0;
  let current = { ...startPoint };

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
    totalDistance += nearestDistance;

    ordered.push({
      ...nextPoint,
      distanceFromPrevious: nearestDistance
    });

    current = nextPoint;
  }

  return {
    orderedPoints: ordered,
    totalDistance
  };
}

export { haversineDistance, nearestNeighborRoute };