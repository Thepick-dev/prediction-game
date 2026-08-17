interface IconProps {
  size?: number
  color?: string
  className?: string
}

// Pop-art-only icon set replacing the handful of emoji that repeat across
// the site (leader crown, streak flame, All-or-Nothing status, archive
// winner). Thick single-colour strokes so they sit on the accent palette
// instead of each device's own emoji rendering. Classic theme keeps emoji
// untouched everywhere — these are never used there.

export function CrownIcon({ size = 16, color = 'var(--pop-yellow)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 18h16M4.5 18l1-8L9 12l3-6 3 6 3.5-2 1 8" />
      <circle cx="5.5" cy="10" r="1" fill={color} stroke="none" />
      <circle cx="12" cy="6" r="1" fill={color} stroke="none" />
      <circle cx="18.5" cy="10" r="1" fill={color} stroke="none" />
    </svg>
  )
}

export function FlameIcon({ size = 16, color = 'var(--pop-orange)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M12 2c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-2.5-1.5-4-1.5-4s.5 2.5-1 3.5c-1.5 1-3-0.5-2-2C15 8 12 6 12 2z" />
    </svg>
  )
}

export function BoltIcon({ size = 16, color = 'var(--pop-pink)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  )
}

export function CheckIcon({ size = 16, color = 'var(--pop-green)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

export function CrossIcon({ size = 16, color = 'var(--pop-red)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  )
}

export function TrophyIcon({ size = 16, color = 'var(--pop-pink)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className} aria-hidden="true">
      <path d="M8 3h8v2h3a1 1 0 0 1 1 1c0 3-2 5-4.5 5.3A5 5 0 0 1 13 15v3h3v2H8v-2h3v-3a5 5 0 0 1-2.5-3.7C6 10 4 8 4 5a1 1 0 0 1 1-1h3V3z" />
    </svg>
  )
}

// Vibes Champion — admin-assigned, see profiles.is_vibes_champion.
export function ShadesIcon({ size = 16, color = 'var(--pop-blue)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10h6a3 3 0 0 1-3 5 3 3 0 0 1-3-5Z" />
      <path d="M15 10h6a3 3 0 0 1-3 5 3 3 0 0 1-3-5Z" />
      <path d="M9 10h6" />
    </svg>
  )
}

// Cash pool — admin-assigned, see profiles.in_cash_pool.
export function PoundCoinIcon({ size = 16, color = 'var(--pop-orange)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.3 15.5h6M8 11.6h4.2M9.3 15.5V8.7a2.6 2.6 0 0 1 4.5-1.7" />
    </svg>
  )
}

// Sporting Panel — admin-assigned, see profiles.is_sporting_panel. The
// panel "for the Avoidance of Manifestly Unfair Outcomes" — scales of
// justice, matching the deliberately grandiose committee name.
export function ScalesIcon({ size = 16, color = 'var(--pop-green)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3v17M5 6h14M5 6 2.5 10a2.5 2.5 0 0 0 5 0L5 6ZM19 6l-2.5 4a2.5 2.5 0 0 0 5 0L19 6ZM9 20h6" />
    </svg>
  )
}

// Top Dog — current leaderboard leader, see the reign-tracking logic in
// app/leaderboard/page.tsx. Silhouette traced from Wikimedia Commons
// "File:Dog.svg" (Public Domain / CC0, https://commons.wikimedia.org/wiki/File:Dog.svg),
// scaled up from its native 0-1 coordinate space — path data left exactly
// as published, only recoloured.
export function TopDogIcon({ size = 16, color = 'var(--pop-orange)', className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g transform="scale(24)">
        <path fill={color} d="M.73555824.90496726.73066243.90567084.72594252.90628648l-.004544.00049838-.00433881.0003811-.00422153.00029317-.00401633.0001759-.00386973.00008794H.70122895L.6976817.90760572.694281.9074005.6910269.90710734.6879194.90672623.68492913.90622785.68211478.90567084.67941768.90502589l-.0025505-.0007329L.67443394.90347213.67211795.90256333.66994855.90156657.66786708.9005112.66593221.89936786.6640853.89813658.66235564.89684666.66074326.8954688.65921882.8940323.65781163.89250786.6564924.89092479.65526112.88928307.65411778.88755343.65306241.88576513.65121548.88201266.64966172.87802565.64840113.87380412.64737505.86937737.64658351.8647161l-.000557-.00483718L.64561609.85486584.64535223.84967686.64520566.844312.64517635.83882986.64523497.83320115.6452936.82745518.64541086.82162125.64555746.8096016l.0000293-.00609777L.63916652.66785768l-.0267364.12523888C.60680142.81631502.6004691.83812628.63424138.85571601c.02392205.021137-.00281434.04998414-.02884715.0464662C.52729583.90496726.53855325.85293096.54558915.816315L.54981067.76284224.5624753.65378589.55192146.62634592C.46678715.60453465.40909283.5883521.34365903.55317263L.29722214.55950494C.27541087.56302287.2810396.5876485.27892881.60383106L.27189292.6481865l-.0386974.10061326-.00281435.00841376C.2275668.7642494.2282704.79168938.23812064.80576118l.02110768.04224467c.01547897.02318913.0197005.08229061-.02392203.06329372h.00070359l-.0323651-.0133682C.18042632.88811041.16142942.8240838.15298635.77764691l.00140718-.0661667c-.0204041-.0055994-.02884717.1118707-.0204041.13652563l.0204041.06118294C.16002224.92888929.1368038.9359545.12062123.9359545c-.0379938 0-.05487995-.03872674-.06261943-.07109184L.0523731.84023704C.04252283.80294682.04744796.7459561.06644488.7128874L.0762951.6924833C.09247766.65167513.07137.62282796.06644488.6017203.0502623.5355829.03689412.47155629.08262742.40823326L.08684895.40333744C.0847382.398383.07137.38785848.06363051.36320354.04604078.3069164.03056181.2147462.0523731.2147462L.06714846.21404261c.03658664 0 .0253292.1519753.06965534.14212503L.45341896.3596856.5097061.34423594C.5294066.3385779.54699633.3259133.56528964.31465588L.6018763.29214102C.64268446.3336528.6792711.3596856.73907619.38149685c.01618255.12383172-.00211077.151301-.01758973.22514856L.71585775.63689976C.70389673.68969826.70037878.74454891.70319315.79942887l.00140716.0253292c-.00140717.02603281.01407178.0281729.03447588.0345052.0133682.00700658.02251486.03303938-.00351795.04570399h.00070358-.00070358zM.8031028.14649805.8046859.1476707l.0016417.00117264.00331274.00255052.00342999.0027264.00348863.00290231.00354726.00304889.0035766.00316615.0036352.00328341.00366453.00337137.00366452.00348863.00366452.00351795.00724111.00721179.00354726.0036352.00351795.00363522.00343.0036059.00334204.00360589.02251486.02389272c.01407179.01477537.03588306.0126646.05487996.01688614l.0077395.00070359c.02040407.01128674.01407178.0338016.00703588.05065842L.9473386.301317C.92693452.34983533.86783302.35335328.82561766.33083844L.80732435.32098818H.80099204L.78762385.32943126l-.0260328.02113699C.70671109.3266462.66238495.29847332.62720549.2604795L.70882185.15775548l.02743997-.039401.00562873-.0133682.0063323-.01474606S.77355207.0585494.78832744.0648817c.01477536.00636162.02392204.03377229.0204041.04784407L.80450998.12961191.8031028.14649805h.0007036" />
      </g>
    </svg>
  )
}
