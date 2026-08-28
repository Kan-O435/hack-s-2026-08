class AddExpressionBonusToUtterances < ActiveRecord::Migration[8.1]
  def change
    add_column :utterances, :expression_bonus, :integer
    add_column :utterances, :expression_comment, :text
  end
end
