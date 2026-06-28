import { supabase } from './lib/supabase'

export default async function Home() {
  const { data, error } = await supabase.from('_test').select('*')
  
  return (
    <main>
      <h1>Prediction Game</h1>
      <p>Supabase status: {error ? 'Not connected — ' + error.message : 'Connected'}</p>
    </main>
  )
}