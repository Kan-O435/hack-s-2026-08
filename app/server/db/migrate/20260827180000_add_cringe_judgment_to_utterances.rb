class AddCringeJudgmentToUtterances < ActiveRecord::Migration[8.1]
  def change
    add_column :utterances, :cringe_score, :integer
    add_column :utterances, :cringe_phrase, :text
    add_column :utterances, :cringe_reason, :text
  end
end
