package Canto::Chado::GenotypeLookup;

=head1 NAME

Canto::Chado::GenotypeLookup - Look up genotypes in Chado

=head1 SYNOPSIS

=head1 AUTHOR

Kim Rutherford C<< <kmr44@cam.ac.uk> >>

=head1 BUGS

Please report any bugs or feature requests to C<kmr44@cam.ac.uk>.

=head1 SUPPORT

You can find documentation for this module with the perldoc command.

    perldoc Canto::Chado::GenotypeLookup

=over 4

=back

=head1 COPYRIGHT & LICENSE

Copyright 2013 Kim Rutherford, all rights reserved.

This program is free software; you can redistribute it and/or modify it
under the same terms as Perl itself.

=head1 FUNCTIONS

=cut

use perl5i::2;
use Moose;

use Canto::Curs::Utils;

with 'Canto::Role::Configurable';
with 'Canto::Chado::ChadoLookup';
with 'Canto::Role::SimpleCache';

sub _long_allele_identifier
{
  my $allele_feature = shift;

  my %props = map {
    ($_->type()->name(), $_->value());
  } $allele_feature->featureprops()->search({}, { prefetch => 'type' })->all();

  $props{allele_type} //= 'unknown';

  (my $type_tidy = $props{allele_type}) =~ s/[\s,]+/-/g;

  my $ret = Canto::Curs::Utils::make_allele_display_name($allele_feature->name(),
                                                         $props{description},
                                                         $props{allele_type});
  if ($ret !~ /$type_tidy/) {
    # prevent "ssm4delta(deletion)-deletion"
    $ret .= '-' . $type_tidy;
  }

  return $ret;
}

sub _allele_string
{
  my @alleles = @_;

  return
    join " ", sort map {
      _long_allele_identifier($_);
    } @alleles;
}

sub _get_alleles
{
  my $self = shift;
  my $genotype = shift;

  my $schema = $self->schema();

  return $schema->resultset('Feature')
    ->search({ 'type.name' => 'allele',
               'type_2.name' => 'part_of',
               'type_3.name' => 'genotype',
               'object.feature_id' => $genotype->feature_id(),
             },
             { join => [ 'type',
                         {
                           feature_relationship_subjects =>
                             [
                               'type',
                               {
                                 object => [
                                   'type',
                                 ]
                               }
                             ]
                           }
                       ]
                   })
      ->all();

}

sub _genotype_details
{
  my $self = shift;
  my $genotype = shift;

  my $cache = $self->cache();

  my $cache_key = 'genotype_details:' . $genotype->feature_id();

  my $cached_value = $cache->get($cache_key);

  if (defined $cached_value) {
    return $cached_value;
  }

  my @alleles = $self->_get_alleles($genotype);

  my $allele_string = _allele_string(@alleles);

  my $ret_val =
    {
      identifier => $_->uniquename(),
      name => $_->name(),
      allele_string => $allele_string,
      display_name => $_->name() || $allele_string,
    };

  $cache->set($cache_key, $ret_val, $self->config()->{cache}->{default_timeout});

  return $ret_val;
}

sub lookup
{
  my $self = shift;

  my %options = @_;

  if ($options{gene_primary_identifiers}) {
    my $gene_identifiers = $options{gene_primary_identifiers};

    my $cache = $self->cache();

    my $cache_key = 'genotype_gene_lookup:' .
      (join ' ', @$gene_identifiers) . ' max: ' .
      ($options{max_results} ? $options{max_results} : 'none');

    my $cached_value = $cache->get($cache_key);

    if (defined $cached_value) {
      return $cached_value;
    }

    my $schema = $self->schema();

    my $genotype_rs =
      $schema->resultset('Feature')->search({ 'type.name' => 'genotype' },
                                            { join => 'type' });

    my @sub_queries = map {
      my $gene_identifier = $_;
      my $sub_query =
        $schema->resultset('Feature')
          ->search({ 'type.name' => 'genotype',
                     'type_2.name' => 'part_of',
                     'type_3.name' => 'allele',
                     'type_4.name' => 'instance_of',
                     'type_5.name' => 'gene',
                     'object.uniquename' => $gene_identifier,
                   },
                   { join => [ 'type',
                               {
                                 feature_relationship_objects =>
                                   [
                                     'type',
                                     {
                                       subject => [
                                         'type',
                                         {
                                           feature_relationship_subjects =>
                                             [
                                               'type',
                                               {
                                                 object => 'type',
                                               }
                                             ]
                                           }
                                       ]
                                     }
                                   ]
                                 }
                             ]
                   });
      {
        'me.feature_id' =>
          {
            -in => $sub_query->get_column('feature_id')->as_query()
          }
        }
    } @$gene_identifiers;

    my $search_arg = {
      -and => \@sub_queries,
    };

    if ($options{max_results}) {
      $genotype_rs = $genotype_rs->search({}, { rows => $options{max_results} });
    }

    my $res =
      {
        results => [
          map {
            $self->_genotype_details($_);
          } $genotype_rs->search($search_arg)->all(),
        ],
      };

    $cache->set($cache_key, $res, $self->config()->{cache}->{default_timeout});

    return $res;
  } else {
    die "no gene_primary_identifiers option passed to lookup()";
  }
}

1;
