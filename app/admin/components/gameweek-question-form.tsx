'use client'

import { useState } from 'react'

type ExistingQuestion = {
  id: string
  question: string
  question_type: 'multiple_choice' | 'freetext' | null
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
}

export default function GameweekQuestionForm({
  gameweekId,
  existingQuestion,
  saveQuestion,
}: {
  gameweekId: string
  existingQuestion: ExistingQuestion | null
  saveQuestion: (formData: FormData) => void
}) {
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'freetext'>(
    existingQuestion?.question_type ?? 'multiple_choice'
  )

  return (
    <form action={saveQuestion} className="space-y-2">
      <input type="hidden" name="gameweek_id" value={gameweekId} />
      {existingQuestion && <input type="hidden" name="existing_id" value={existingQuestion.id} />}

      <input
        type="text"
        name="question"
        defaultValue={existingQuestion?.question ?? ''}
        placeholder="e.g. Pizza or Burgers?"
        className="w-full border rounded px-3 py-2 text-sm"
        required
      />

      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="question_type"
            value="multiple_choice"
            checked={questionType === 'multiple_choice'}
            onChange={() => setQuestionType('multiple_choice')}
          />
          Multiple Choice
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="question_type"
            value="freetext"
            checked={questionType === 'freetext'}
            onChange={() => setQuestionType('freetext')}
          />
          Free Text
        </label>
      </div>

      {questionType === 'multiple_choice' ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            name="option_a"
            defaultValue={existingQuestion?.option_a ?? ''}
            placeholder="Option A"
            className="border rounded px-3 py-2 text-sm"
            required
          />
          <input
            type="text"
            name="option_b"
            defaultValue={existingQuestion?.option_b ?? ''}
            placeholder="Option B"
            className="border rounded px-3 py-2 text-sm"
            required
          />
          <input
            type="text"
            name="option_c"
            defaultValue={existingQuestion?.option_c ?? ''}
            placeholder="Option C (optional)"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="text"
            name="option_d"
            defaultValue={existingQuestion?.option_d ?? ''}
            placeholder="Option D (optional)"
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      ) : (
        <p className="text-xs text-gray-500">
          Players will type their own answer directly on the Picks page — no options to set here.
        </p>
      )}

      <div className="flex gap-2 items-center">
        <button type="submit" className="text-xs bg-black text-white rounded px-3 py-1.5">
          {existingQuestion ? 'Update Question' : 'Save Question'}
        </button>
      </div>
    </form>
  )
}
